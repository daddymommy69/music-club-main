import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { detectArtworkTrim, MAX_ARTWORK_TRIM } from "./artworkTrim";
import { trimScale, TARGET_ARTWORK_TRIM } from "./artworkTrimMath";

/** Builds a synthetic square image: a solid white border `borderPx`
 * wide on every edge, with varied (never-uniform) color inside it, so
 * tests don't depend on fetching a real file. */
async function makeBorderedImage(size: number, borderPx: number): Promise<Buffer> {
  const channels = 3;
  const buf = Buffer.alloc(size * size * channels);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * channels;
      const isBorder = x < borderPx || x >= size - borderPx || y < borderPx || y >= size - borderPx;
      if (isBorder) {
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
});

describe("trimScale", () => {
  it("never scales above 1 — an image that already meets the target is left alone", () => {
    expect(trimScale(TARGET_ARTWORK_TRIM)).toBe(1);
    expect(trimScale(MAX_ARTWORK_TRIM)).toBeLessThanOrEqual(1); // more border than target — still untouched, never cropped into
  });

  it("shrinks a full-bleed image down toward the target instead of zooming into it", () => {
    const scale = trimScale(0);
    expect(scale).toBeLessThan(1);
    expect(scale).toBeCloseTo(1 - 2 * TARGET_ARTWORK_TRIM, 5);
  });

  it("is never the old backwards zoom-in formula (1 / (1 - 2*trim))", () => {
    // The bug this replaces: scaling UP by the image's own detected
    // trim, which crops into any image that already has a border
    // instead of only padding out images that lack one.
    const detected = 0.31; // close to Drop 1's own real measured trim
    const buggyZoomIn = 1 / (1 - 2 * detected);
    expect(trimScale(detected)).not.toBeCloseTo(buggyZoomIn, 2);
    expect(trimScale(detected)).toBeLessThanOrEqual(1);
  });
});
