import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { shrinkAndPad } from "./dropCover";

async function makeSolidImage(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: "#336699" } }).jpeg().toBuffer();
}

describe("shrinkAndPad", () => {
  it("shrinks and pads without throwing, and keeps the original canvas size", async () => {
    // Regression test for a real bug (2026-10-25, caught by the
    // founder trying to download Drop 2's cover and getting a 404):
    // chaining .resize() directly onto a sharp().composite() pipeline
    // threw "Image to composite must have same dimensions or smaller"
    // whenever a quadrant actually needed shrinking (every one of
    // Drop 2's full-bleed images did). shrinkAndPad() must return a
    // fully materialized buffer a caller can safely resize afterward.
    const buf = await makeSolidImage(640, 640);
    const out = await shrinkAndPad(buf, 0.8);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(640);

    // The further resize a real caller (dropCover.ts's fetchQuadBuffer)
    // always chains next must not throw either.
    const final = await sharp(out).resize(319, 319, { fit: "cover" }).jpeg().toBuffer();
    expect(final.length).toBeGreaterThan(0);
  });

  it("is a no-op for scale >= 1 — never crops into an image", async () => {
    const buf = await makeSolidImage(300, 300);
    const out = await shrinkAndPad(buf, 1);
    expect(out).toBe(buf);
  });

  it("handles a non-square source the same way DropTile's real artwork does", async () => {
    const buf = await makeSolidImage(1200, 630);
    const out = await shrinkAndPad(buf, 0.7);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
  });
});
