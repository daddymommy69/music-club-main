import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { shrinkAndPad, cropToFill, pickCoverArtworkUrls } from "./dropCover";

async function makeSolidImage(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: "#336699" } }).jpeg().toBuffer();
}

/** Same shape as artworkTrim.test.ts's makeBorderedImage — a solid
 * border `borderPx` wide on every edge, varied (never-uniform) content
 * inside it, so a crop-to-fill test can assert the border pixels are
 * actually gone rather than just checking output dimensions. */
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

describe("cropToFill", () => {
  // Regression test for a real bug (2026-11-03, round 2 — founder's own
  // report, screenshot in hand): Drop 1's own song-artwork files each
  // have a generous native white border baked into the file, which used
  // to show up as a second margin stacked on top of this file's own
  // uniform shrinkAndPad step. cropToFill zooms in past a file's own
  // border before that uniform step runs, so the end result is one
  // consistent margin, not two.

  it("crops a border off every edge and keeps the original canvas size", async () => {
    const buf = await makeBorderedImage(200, 40); // 20% border on every edge
    const out = await cropToFill(buf, 0.2);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(200);
  });

  it("the border color is actually gone from the output, not just resized", async () => {
    const buf = await makeBorderedImage(200, 40, [255, 255, 255]);
    const out = await cropToFill(buf, 0.2);
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    // Sample the very edge pixels — if the crop worked, the border is
    // gone and these should be regular (non-near-white) image content,
    // not the solid white that was there before cropping.
    const corner = [data[0], data[1], data[2]];
    const isNearWhite = corner.every((c) => c > 240);
    expect(isNearWhite).toBe(false);
    void info;
  });

  it("is a no-op at trim <= 0 — never crops an image that has no border", async () => {
    const buf = await makeSolidImage(300, 300);
    const out = await cropToFill(buf, 0);
    expect(out).toBe(buf);
  });

  it("never crops an image down to nothing on an absurd trim value", async () => {
    const buf = await makeSolidImage(10, 10);
    const out = await cropToFill(buf, 0.9);
    expect(out).toBe(buf); // safety fallback, not a throw
  });
});

describe("pickCoverArtworkUrls", () => {
  // Regression test for a real bug (2026-10-31, founder's own report):
  // the cover route and spotifyBuild.ts each used to naively
  // `.slice(0, 4)` a drop's position-ordered songs before reading
  // artworkUrl, so a song with no artwork sitting among the first 4
  // left that quadrant blank — a different, wrong set of quadrants than
  // DropDetail.tsx's hero tile (`.filter(artworkUrl).slice(0, 4)`) and
  // the archive grid show for the exact same drop.

  it("skips a song with no artwork instead of leaving its quadrant blank", () => {
    const urls = ["a", null, "b", "c", "d"];
    expect(pickCoverArtworkUrls(urls)).toEqual(["a", "b", "c", "d"]);
  });

  it("pads out to 4 slots with null when fewer than 4 songs have artwork", () => {
    expect(pickCoverArtworkUrls(["a", null, null])).toEqual(["a", null, null, null]);
    expect(pickCoverArtworkUrls([])).toEqual([null, null, null, null]);
  });

  it("never returns more than 4, even with plenty of artwork to choose from", () => {
    expect(pickCoverArtworkUrls(["a", "b", "c", "d", "e", "f"])).toEqual(["a", "b", "c", "d"]);
  });
});
