import sharp from "sharp";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { artworkTrimCache } from "@/db/schema";
import { isUniqueViolation } from "./normalize";

/**
 * Detects how much of a piece of artwork is a solid-color border baked
 * into the image file itself, not real artwork (2026-10-25 round — see
 * claude/next-build.md: the founder noticed one drop's cover-art
 * collage read as way more generously matted than another's on
 * /releases, and it turned out to have nothing to do with CSS — some
 * source image files already have their own padding baked in (a photo
 * centered on a plain background), others are full-bleed. DropTile and
 * dropCover.ts both zoom each quadrant in by the fraction this returns
 * so every drop's artwork fills a consistent amount of its frame,
 * regardless of what the original file looked like.
 *
 * Cached forever per exact URL (scripts/migrate-next-build-12.sql),
 * same cache-or-fetch spirit as src/lib/artists.ts's
 * getOrFetchArtistPhoto — no TTL, no override UI yet. Best-effort
 * throughout: any fetch/decode/detect failure returns 0 (no trim)
 * rather than ever blocking a page on a bad image URL.
 */

const SAMPLE = 48; // downscale target — plenty for detecting a uniform border, fast to scan
const COLOR_TOLERANCE = 14; // per-channel (0-255) slack for "close enough to the border color"
const ROW_MATCH_THRESHOLD = 0.92; // fraction of a row/column that must match to count as "still border"
// Cap how far in we'll ever zoom — guards against a false-positive
// detection (e.g. a genuinely solid-color album cover) eating the
// whole image.
export const MAX_ARTWORK_TRIM = 0.32;

type RGB = readonly [number, number, number];

function closeTo(a: RGB, b: RGB): boolean {
  return (
    Math.abs(a[0] - b[0]) <= COLOR_TOLERANCE &&
    Math.abs(a[1] - b[1]) <= COLOR_TOLERANCE &&
    Math.abs(a[2] - b[2]) <= COLOR_TOLERANCE
  );
}

/** Pure function: given already-fetched image bytes, returns the
 * fraction (0 to MAX_ARTWORK_TRIM) of each edge that's solid-color
 * border. Exported separately from the cache-or-fetch helpers below so
 * dropCover.ts — which already has the bytes in hand via its own
 * fetch — can detect without a second network round trip. */
export async function detectArtworkTrim(buffer: Buffer): Promise<number> {
  const { data, info } = await sharp(buffer)
    .resize(SAMPLE, SAMPLE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (width < 4 || height < 4) return 0;

  const pixelAt = (x: number, y: number): RGB => {
    const idx = (y * width + x) * channels;
    return [data[idx], data[idx + 1], data[idx + 2]];
  };

  // Average the 4 corners as the border's reference color — more
  // robust than trusting any single corner pixel (a slight gradient or
  // compression artifact right at the corner shouldn't throw this off).
  const corners = [pixelAt(0, 0), pixelAt(width - 1, 0), pixelAt(0, height - 1), pixelAt(width - 1, height - 1)];
  const ref: RGB = [
    Math.round(corners.reduce((sum, p) => sum + p[0], 0) / 4),
    Math.round(corners.reduce((sum, p) => sum + p[1], 0) / 4),
    Math.round(corners.reduce((sum, p) => sum + p[2], 0) / 4),
  ];

  const rowIsBorder = (y: number): boolean => {
    let hits = 0;
    for (let x = 0; x < width; x++) if (closeTo(pixelAt(x, y), ref)) hits++;
    return hits / width >= ROW_MATCH_THRESHOLD;
  };
  const colIsBorder = (x: number): boolean => {
    let hits = 0;
    for (let y = 0; y < height; y++) if (closeTo(pixelAt(x, y), ref)) hits++;
    return hits / height >= ROW_MATCH_THRESHOLD;
  };

  let top = 0;
  while (top < height / 2 && rowIsBorder(top)) top++;
  let bottom = 0;
  while (bottom < height / 2 && rowIsBorder(height - 1 - bottom)) bottom++;
  let left = 0;
  while (left < width / 2 && colIsBorder(left)) left++;
  let right = 0;
  while (right < width / 2 && colIsBorder(width - 1 - right)) right++;

  const maxBorder = Math.max(top, bottom, left, right);
  return Math.min(maxBorder / SAMPLE, MAX_ARTWORK_TRIM);
}

export async function getCachedArtworkTrim(url: string): Promise<number | null> {
  try {
    const [cached] = await getDb()
      .select({ trimPct: artworkTrimCache.trimPct })
      .from(artworkTrimCache)
      .where(eq(artworkTrimCache.url, url))
      .limit(1);
    return cached ? cached.trimPct : null;
  } catch {
    return null; // cache read failing is never worth blocking a render over
  }
}

export async function cacheArtworkTrim(url: string, trimPct: number): Promise<void> {
  try {
    await getDb().insert(artworkTrimCache).values({ url, trimPct });
  } catch (err) {
    // Lost a race with a concurrent lookup for the same URL — fine, the
    // other write already cached it. Any other failure is swallowed
    // too (same best-effort contract as the rest of this file): worst
    // case, this URL just gets re-detected next time instead of
    // reading from cache, never worth failing a page render over.
    if (!isUniqueViolation(err)) {
      console.error("[artworkTrim] cache write failed:", err);
    }
  }
}

/** Cache-or-detect for one URL — fetches and analyzes only on a cache
 * miss. null/empty url always returns 0 with no network call. */
export async function getOrDetectArtworkTrim(url: string | null | undefined): Promise<number> {
  if (!url) return 0;

  const cached = await getCachedArtworkTrim(url);
  if (cached !== null) return cached;

  let trim = 0;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      trim = await detectArtworkTrim(Buffer.from(await res.arrayBuffer()));
    }
  } catch {
    trim = 0;
  }

  await cacheArtworkTrim(url, trim);
  return trim;
}

/** Batch helper for a page's worth of artwork at once — dedupes
 * identical URLs (the same single's art often appears more than once)
 * and resolves every lookup in parallel. */
export async function getArtworkTrims(urls: (string | null | undefined)[]): Promise<Map<string, number>> {
  const unique = [...new Set(urls.filter((u): u is string => !!u))];
  const entries = await Promise.all(unique.map(async (u) => [u, await getOrDetectArtworkTrim(u)] as const));
  return new Map(entries);
}
