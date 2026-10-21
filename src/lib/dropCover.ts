import sharp from "sharp";
import { DROP_COVER_DIGITS, DIGIT_TILE_WIDTH, DIGIT_TILE_HEIGHT } from "./dropCoverDigits";

/**
 * Builds the Spotify playlist cover for a drop: the same 2x2 artwork
 * grid + centered drop number that DropTile.tsx renders on the site
 * (src/app/_components/DropTile.tsx), baked into a flat JPEG — Spotify
 * only accepts a static image for a custom cover, not a live component.
 * Edge-to-edge (no outer card/border, since Spotify's own UI already
 * rounds/crops cover art — an extra frame baked into the image would
 * look double-framed there) — and, as of 2026-10-19, no gap between
 * the 4 quadrants either (founder's own report: "no black borders in
 * between each, so the white is seamless" — the thin gap this used to
 * keep per a 2026-10 decision is gone for good now, superseded by this
 * explicit ask).
 *
 * This is the exact same function behind BOTH the curator-tools
 * download (/api/drops/[num]/cover) and the Spotify auto-build cover
 * (src/lib/spotifyBuild.ts) — one fix here covers both, per the
 * founder's "all the covers should be the same everywhere."
 *
 * Best-effort like everything else in the Spotify auto-build path: any
 * failure (an artwork URL that won't fetch, whatever) returns null
 * rather than throwing, and the caller just skips setting a cover — a
 * playlist with Spotify's own default blank cover is a fine fallback,
 * never worth failing the whole build over.
 */

const SIZE = 640;
const GAP = 0;
const HALF = Math.floor((SIZE - GAP) / 2);
const BG = "#2b2b2b"; // approximates the site's dark tile background

async function fetchQuadBuffer(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return await sharp(bytes).resize(HALF, HALF, { fit: "cover" }).jpeg().toBuffer();
  } catch {
    return null;
  }
}

/**
 * Two pre-rendered digit tiles (src/lib/dropCoverDigits.ts), stamped
 * side by side — NOT live SVG `<text>` (2026-10-21, see that file's own
 * comment for the full why: live text rendering kept silently failing
 * to draw on Vercel even after the font-loading fix, confirmed by the
 * founder downloading a cover with the gap fixed but the number still
 * missing). Pure pixel compositing, same font (Martian Mono Bold) the
 * on-site drop tile itself uses, so this can't fail the way the text
 * approach did and now visually matches the website.
 */
function numberComposites(num: number): { input: Buffer; left: number; top: number }[] {
  const label = String(num).padStart(2, "0");
  const totalW = DIGIT_TILE_WIDTH * label.length;
  const left = Math.round((SIZE - totalW) / 2);
  // Slightly below dead-center (matches the old live-text version's
  // y="52%" rather than a plain 50% — an optical-balance nudge, not a
  // bug) — same +2%-of-canvas offset, expressed directly in pixels now.
  const top = Math.round((SIZE - DIGIT_TILE_HEIGHT) / 2 + SIZE * 0.02);
  return label.split("").map((digit, i) => ({
    input: Buffer.from(DROP_COVER_DIGITS[digit], "base64"),
    left: left + i * DIGIT_TILE_WIDTH,
    top,
  }));
}

export async function buildDropCoverJpegBase64(
  artworkUrls: (string | null)[],
  num: number
): Promise<string | null> {
  try {
    // Same always-4-quadrants shape as DropTile — a missing quadrant
    // just stays the plain background fill rather than being skipped,
    // so the grid never looks lopsided.
    const quads = Array.from({ length: 4 }, (_, i) => artworkUrls[i] ?? null);
    const quadBuffers = await Promise.all(quads.map(fetchQuadBuffer));

    if (quadBuffers.every((b) => b === null)) return null; // nothing to show at all

    const positions = [
      { left: 0, top: 0 },
      { left: HALF + GAP, top: 0 },
      { left: 0, top: HALF + GAP },
      { left: HALF + GAP, top: HALF + GAP },
    ];

    const composites: { input: Buffer; left: number; top: number }[] = [];
    quadBuffers.forEach((buf, i) => {
      if (buf) composites.push({ input: buf, left: positions[i].left, top: positions[i].top });
    });
    composites.push(...numberComposites(num));

    const base = sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: BG } });
    const jpeg = await base.composite(composites).jpeg({ quality: 82 }).toBuffer();

    // Spotify's hard cap is 256KB; step quality down if a particularly
    // busy set of photos lands above it rather than uploading a cover
    // that'll just get rejected.
    let quality = 82;
    let out = jpeg;
    while (out.length > 250 * 1024 && quality > 40) {
      quality -= 15;
      out = await base.composite(composites).jpeg({ quality }).toBuffer();
    }
    if (out.length > 256 * 1024) return null;

    return out.toString("base64");
  } catch {
    return null;
  }
}
