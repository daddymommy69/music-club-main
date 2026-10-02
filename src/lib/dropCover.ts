import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

/**
 * Builds the Spotify playlist cover for a drop: the same 2x2 artwork
 * grid + centered drop number that DropTile.tsx renders on the site
 * (src/app/_components/DropTile.tsx), baked into a flat JPEG — Spotify
 * only accepts a static image for a custom cover, not a live component.
 * Edge-to-edge (no outer card/border, since Spotify's own UI already
 * rounds/crops cover art — an extra frame baked into the image would
 * look double-framed there), but keeping the thin gap between the 4
 * quadrants that the on-site tile has, per founder decision 2026-10.
 *
 * Best-effort like everything else in the Spotify auto-build path: any
 * failure (an artwork URL that won't fetch, the font not being
 * bundled, whatever) returns null rather than throwing, and the caller
 * just skips setting a cover — a playlist with Spotify's own default
 * blank cover is a fine fallback, never worth failing the whole build
 * over.
 */

const SIZE = 640;
const GAP = Math.round(SIZE * 0.025);
const HALF = Math.floor((SIZE - GAP) / 2);
const BG = "#2b2b2b"; // approximates the site's dark tile background
const FG = "#ffffff";

function loadFontBase64(): string | null {
  // Reused from the app's own font package (already a dependency for
  // on-site text) rather than bundling a separate font file — see
  // package.json's @fontsource/jetbrains-mono.
  const candidates = [
    "jetbrains-mono-latin-800-normal.woff",
    "jetbrains-mono-latin-700-normal.woff",
  ];
  for (const file of candidates) {
    try {
      const fontPath = path.join(
        process.cwd(),
        "node_modules",
        "@fontsource",
        "jetbrains-mono",
        "files",
        file
      );
      return fs.readFileSync(fontPath).toString("base64");
    } catch {
      continue;
    }
  }
  return null;
}

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

function numberSvg(num: number, fontBase64: string | null): Buffer {
  const label = String(num).padStart(2, "0");
  const fontFace = fontBase64
    ? `@font-face { font-family: 'DropNum'; src: url(data:font/woff;base64,${fontBase64}) format('woff'); font-weight: 800; }`
    : "";
  const fontFamily = fontBase64 ? "DropNum, monospace" : "monospace";
  const svg = `
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs><style>${fontFace}</style></defs>
      <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle"
        font-family="${fontFamily}" font-weight="800" font-size="${Math.round(SIZE * 0.14)}"
        fill="${FG}">${label}</text>
    </svg>`;
  return Buffer.from(svg);
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
    composites.push({ input: numberSvg(num, loadFontBase64()), left: 0, top: 0 });

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
