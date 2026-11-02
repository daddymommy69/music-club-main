import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { detectArtworkTrim, MAX_ARTWORK_TRIM } from "./artworkTrim";
import { trimScale, TARGET_ARTWORK_TRIM } from "./artworkTrimMath";

/** Builds a synthetic square image: a solid border `borderPx` wide on
 * every edge in `borderColor` (default white), with varied
 * (never-uniform) color inside it, so tests don't depend on fetching a
 * real file. */
async function makeBorderedImage(
  size: number,
  borderPx: number,
  borderColor: [number, number, number] = [255, 255, 255]
): Promise<Buffer> {
  const channels = 3;
  const buf = Buffer.alloc(size * size * channels);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * channels;
      const isBorder = x < borderPx || x >= size - borderPx || y < borderPx || y >= size - borderPx;
      if (isBorder) {
        buf[idx] = borderColor[0];
        buf[idx + 1] = borderColor[1];
        buf[idx + 2] = borderColor[2];
      } else {
        buf[idx] = (x * 7) % 256;
        buf[idx + 1] = (y * 13) % 256;
        buf[idx + 2] = ((x + y) * 5) % 256;
      }
    }
  }
  return sharp(buf, { raw: { width: size, height: size, channels } }).png().toBuffer();
}

describe("detectArtworkTrim", () => {
  it("detects a border close to its actual width", async () => {
    const buf = await makeBorderedImage(96, 19); // ~20% border on every edge
    const trim = await detectArtworkTrim(buf);
    expect(trim).toBeGreaterThan(0.12);
    expect(trim).toBeLessThanOrEqual(MAX_ARTWORK_TRIM);
  });

  it("detects ~no border on a full-bleed image", async () => {
    const buf = await makeBorderedImage(96, 0);
    const trim = await detectArtworkTrim(buf);
    expect(trim).toBeLessThan(0.05);
  });

  it("caps detection at MAX_ARTWORK_TRIM so a false positive can't eat the whole image", async () => {
    const buf = await makeBorderedImage(96, 96); // entirely the "border" color
    const trim = await detectArtworkTrim(buf);
    expect(trim).toBe(MAX_ARTWORK_TRIM);
  });

  it("treats a large near-black border as no border at all, not a deliberate matte", async () => {
    // Regression test for a real bug (2026-11-01, founder's own
    // report): a band photo with lots of black negative space around
    // the group got read as "already has a generous border" and was
    // left full-bleed, while its 3 sibling quadrants in the same
    // drop's cover (ordinary album art, no black background) got
    // shrunk and white-padded — so one quadrant rendered visibly
    // bigger/more zoomed-in than the other three in the same grid.
    // A black backdrop in a press photo isn't a deliberate matte the
    // way a white/cream/colored border is, so this should come back as
    // 0 (no border detected) instead of a large value, so the image
    // still gets padded in line with its siblings.
    const buf = await makeBorderedImage(96, 30, [4, 4, 2]); // near-black, not pure black — still should count
    const trim = await detectArtworkTrim(buf);
    expect(trim).toBe(0);
  });

  it("still detects a genuine non-black border normally", async () => {
    // Sanity check that the near-black carve-out above doesn't disable
    // border detection generally — only near-black reference colors.
    const buf = await makeBorderedImage(96, 19, [240, 230, 210]); // cream/off-white matte
    const trim = await detectArtworkTrim(buf);
    expect(trim).toBeGreaterThan(0.12);
  });

  it("ignores a landscape source's left/right bars once they'd be cropped away by the real render", async () => {
    // Regression test for a real bug (2026-11-02, founder's own
    // report): 3 of drop 3's 4 quadrants measured visibly short of the
    // 15% padding target once the unrelated near-black bug could no
    // longer explain it. Root cause: detectArtworkTrim used to sample
    // with `fit: "fill"` (stretch to square, no crop), so a
    // non-square source's border on only its WIDER dimension (e.g. a
    // landscape cover's left/right bars) still read as real border —
    // even though fetchQuadBuffer's own final resize (`fit: "cover"`)
    // crops a landscape source from the sides to make it square,
    // discarding exactly that border before it ever reaches the page.
    // Detected border that can't survive to be seen made trimScale
    // think the image already had enough matting and skip adding real
    // padding, under-matting the actual rendered quadrant.
    //
    // A 192x96 source (2:1 landscape) with a 40px white bar on the
    // left and right (full height), busy non-white content in the
    // center 112px: `fit: "cover"` into a square crops 48 of the
    // original 192px off each side (scaling to fit the 96px height),
    // which removes the entire 40px bar — nothing white should remain
    // in what detectArtworkTrim actually samples.
    const width = 192;
    const height = 96;
    const channels = 3;
    const barPx = 40;
    const buf = Buffer.alloc(width * height * channels);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        const inBar = x < barPx || x >= width - barPx;
        if (inBar) {
          buf[idx] = 255;
          buf[idx + 1] = 255;
          buf[idx + 2] = 255;
        } else {
          buf[idx] = (x * 7) % 256;
          buf[idx + 1] = (y * 13) % 256;
          buf[idx + 2] = ((x + y) * 5) % 256;
        }
      }
    }
    const image = await sharp(buf, { raw: { width, height, channels } }).png().toBuffer();
    const trim = await detectArtworkTrim(image);
    expect(trim).toBeLessThan(0.05);
  });
});

describe("trimScale", () => {
  // 2026-11-02 — founder's own call: trimScale no longer varies by the
  // image's own detected border at all (see its own comment in
  // artworkTrimMath.ts for the full story — repeated per-image
  // false-positive detections, a band photo's black background then an
  // album cover's navy one, each separately read as a deliberate
  // matte). It always returns the same fixed scale now, regardless of
  // input, so every quadrant/tile ends up padded identically.

  it("always returns the same fixed scale, regardless of input", () => {
    const expected = 1 - 2 * TARGET_ARTWORK_TRIM;
    expect(trimScale(0)).toBeCloseTo(expected, 10);
    expect(trimScale(TARGET_ARTWORK_TRIM)).toBeCloseTo(expected, 10);
    expect(trimScale(MAX_ARTWORK_TRIM)).toBeCloseTo(expected, 10);
    expect(trimScale(0.31)).toBeCloseTo(expected, 10); // ~Drop 1's own real measured trim — no longer special-cased
  });

  it("is less than 1 — every image gets shrunk and padded, never cropped into", () => {
    expect(trimScale(0)).toBeLessThan(1);
    expect(trimScale(MAX_ARTWORK_TRIM)).toBeLessThan(1);
  });
});
