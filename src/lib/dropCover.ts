import sharp from "sharp";
import { DROP_COVER_DIGITS, DIGIT_TILE_WIDTH, DIGIT_TILE_HEIGHT } from "./dropCoverDigits";
import { trimScale } from "./artworkTrimMath";

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

/**
 * Shrinks an image toward its center by `scale` (< 1) and pads the
 * freed-up edges with white, so the visible artwork ends up occupying
 * exactly `scale` of the frame — the server-side equivalent of
 * DropTile.tsx's CSS `scale()` transform. sharp's extract() can only
 * crop (zoom in); achieving the opposite (zoom out, reveal more
 * border) means resizing the image down and compositing it onto a
 * full-size white canvas, matching the site's own tile/slot background
 * (globals.css's .drop-tile / .drop-tile-quad-empty).
 *
 * Exported standalone (and returning a fully materialized buffer,
 * rather than a lazy sharp() pipeline) so it's unit-testable without a
 * network fetch, and so callers never hit the bug this fixed: chaining
 * a further .resize() directly onto the composite() pipeline throws
 * "Image to composite must have same dimensions or smaller" (confirmed
 * against a real Drop 2 image, 2026-10-25) — sharp validates the
 * composite input against the pipeline's FINAL output size, not this
 * canvas's own width/height, so a same-chain resize down to a small
 * target size makes an otherwise-valid composite look oversized.
 * Materializing this step to a buffer and starting a fresh sharp()
 * for whatever comes next sidesteps that entirely.
 */
export async function shrinkAndPad(bytes: Buffer, scale: number): Promise<Buffer> {
  const { width, height } = await sharp(bytes).metadata();
  if (!width || !height || scale >= 1) return bytes;

  const shrunkW = Math.max(1, Math.round(width * scale));
  const shrunkH = Math.max(1, Math.round(height * scale));
  const shrunk = await sharp(bytes).resize(shrunkW, shrunkH, { fit: "fill" }).toBuffer();

  return sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
    .composite([{ input: shrunk, left: Math.round((width - shrunkW) / 2), top: Math.round((height - shrunkH) / 2) }])
    .png()
    .toBuffer();
}

/**
 * Picks up to 4 artwork URLs for the cover grid, skipping any song with
 * no artwork rather than leaving it an empty quadrant — the exact same
 * "skip songs with no artwork" rule DropDetail.tsx's hero tile and the
 * archive grid (src/lib/archive.ts's getPublishedDrops) already use for
 * their own 2x2 collages. Exported/pure (no network call) so both real
 * callers of buildDropCoverJpegBase64 below — the curator-tools download
 * and spotifyBuild.ts's ship-time auto-build cover — share exactly one
 * implementation instead of each re-deriving "the first 4" themselves.
 *
 * Fixes a real bug (2026-10-31 — founder's own report, screenshots of a
 * downloaded cover showing 4 different songs than the site's own archive
 * tile for the same drop): this file used to take artworkUrls already
 * sliced to 4 by each caller via a plain `.slice(0, 4)` on the raw,
 * position-ordered song list — so a song with no artwork sitting among
 * the first 4 by position just left a quadrant blank here, while
 * DropDetail.tsx's hero tile (`.filter(artworkUrl).slice(0, 4)`) and the
 * archive grid skip straight past it to the next song that actually has
 * art. Two different selections off the same song list, silently
 * diverging whenever a drop's early tracks were missing artwork. Now
 * callers just pass every song's artworkUrl (in position order,
 * unsliced) and this picks the same first-4-with-art set everywhere
 * else on the site already does.
 */
export function pickCoverArtworkUrls(urls: (string | null)[]): (string | null)[] {
  const picked = urls.filter((u): u is string => !!u).slice(0, 4);
  return Array.from({ length: 4 }, (_, i) => picked[i] ?? null);
}

/**
 * 2026-11-02 — founder's own call: this used to call out to
 * detectArtworkTrim()/getCachedArtworkTrim() per URL to decide how much
 * each individual image needed shrinking, varying it image to image.
 * That kept producing new false positives (a band photo's black
 * background, then an album cover's navy background, each separately
 * read as a deliberate matte and left under-padded next to its
 * properly-padded siblings) — see trimScale()'s own comment
 * (artworkTrimMath.ts) for the full story. Every quadrant now gets the
 * exact same fixed shrink unconditionally, no per-image detection, no
 * DB round trip — guaranteed-consistent instead of "usually right."
 */
async function fetchQuadBuffer(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());

    const scale = trimScale(0); // argument ignored — see trimScale()'s own comment
    const padded = scale < 1 ? await shrinkAndPad(bytes, scale) : bytes;

    return await sharp(padded).resize(HALF, HALF, { fit: "cover" }).jpeg().toBuffer();
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
  // Dead-center vertically (2026-10-22: removed the old +2%-of-canvas
  // downward nudge per explicit instruction — it was reading as "a
  // little low" once the color changed to charcoal, so straight
  // mathematical center it is now).
  const top = Math.round((SIZE - DIGIT_TILE_HEIGHT) / 2);
  return label.split("").map((digit, i) => ({
    input: Buffer.from(DROP_COVER_DIGITS[digit], "base64"),
    left: left + i * DIGIT_TILE_WIDTH,
    top,
  }));
}

/**
 * `artworkUrls` is every song's own artworkUrl, in position order,
 * UNSLICED — pass the whole drop, not your own "first 4" (see
 * pickCoverArtworkUrls above for why: that selection happens in here
 * now, not at each call site).
 */
export async function buildDropCoverJpegBase64(
  artworkUrls: (string | null)[],
  num: number
): Promise<string | null> {
  try {
    // Same always-4-quadrants shape as DropTile — a quadrant with no art
    // anywhere in the drop stays the plain background fill rather than
    // being skipped, so the grid never looks lopsided. Which 4 songs
    // that art comes FROM is pickCoverArtworkUrls' job, above — this
    // only pads out to exactly 4 slots, never selects.
    const quads = pickCoverArtworkUrls(artworkUrls);
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
