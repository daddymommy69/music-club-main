import sharp from "sharp";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { artworkTrimCache } from "@/db/schema";
import { MAX_ARTWORK_TRIM, TARGET_ARTWORK_TRIM, trimScale } from "./artworkTrimMath";

// Re-exported so existing imports from this file (dropCover.ts,
// artworkTrim.test.ts) keep working — the actual constants/math now
// live in artworkTrimMath.ts (see that file's own comment for why:
// DropTile.tsx, a client component, needs trimScale() without pulling
// this file's server-only @/db/client import into the browser bundle).
export { MAX_ARTWORK_TRIM, TARGET_ARTWORK_TRIM, trimScale };

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
 * fetch — can detect without a second network round trip.
 *
 * Samples with `fit: "cover"` (center-crop to square, then scale) —
 * NOT `fit: "fill"` (stretch to square, no crop) — because that's
 * exactly what fetchQuadBuffer's own final resize does to turn this
 * same source image into a cover quadrant (see dropCover.ts). A
 * non-square source's full un-cropped file can have real border on
 * only its wider dimension (e.g. a landscape photo's left/right bars),
 * which `fit: "cover"` crops away entirely before anything reaches the
 * page. Sampling with "fill" used to let that doomed-to-be-cropped
 * border count toward the detected trim anyway — overstating it, so
 * trimScale concluded the image already had enough border and skipped
 * adding real padding, under-matting the actual rendered quadrant
 * (2026-11-02 — founder's own report: 3 of drop 3's 4 quadrants
 * measuring visibly short of the 15% target once the 4th, unrelated
 * near-black bug was fixed and could no longer explain it). Sampling
 * the same crop the render will actually use keeps detection honest
 * about what border survives to be seen.
 */
export async function detectArtworkTrim(buffer: Buffer): Promise<number> {
  const { data, info } = await sharp(buffer)
    .resize(SAMPLE, SAMPLE, { fit: "cover" })
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

  // A near-black reference color almost never means a deliberate matte
  // the way a white/cream/colored border does — it's usually just dark
  // photo background (a press photo shot against a black backdrop,
  // empty headroom above a group, etc). Since color alone can't tell
  // "this is the artwork's real border" from "this is just a dark
  // photo," treat near-black as no border detected at all, so an image
  // like that still gets shrunk/padded in line with every other
  // quadrant in its drop instead of reading as already-matted and
  // staying full-bleed next to padded siblings (2026-11-01 — founder's
  // own report: a band-photo quadrant rendered full-bleed/zoomed next
  // to its 3 padded neighbors in the same drop's cover grid, because
  // its own large black negative space was mistaken for a border).
  const NEAR_BLACK_MAX = 24;
  if (ref[0] <= NEAR_BLACK_MAX && ref[1] <= NEAR_BLACK_MAX && ref[2] <= NEAR_BLACK_MAX) return 0;

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

/**
 * How recent a cached row's `computedAt` must be to still be trusted —
 * the same cache-busting spirit as dropCoverPath.ts's
 * DROP_COVER_CACHE_VERSION, just keyed off the timestamp this table
 * already stores per row instead of a new version column.
 *
 * 2026-11-02 fix: detectArtworkTrim gained the near-black carve-out
 * above (see its own comment) so a photo's black negative space stops
 * reading as a deliberate border. But this table caches a URL's
 * detected trim forever once computed — "no TTL, no override UI yet"
 * by original design, since a drop's own artwork never changes after
 * it ships. That assumption doesn't hold when the DETECTION LOGIC
 * itself changes: a URL whose trim was cached under the old algorithm
 * keeps returning that same wrong value no matter what
 * detectArtworkTrim now computes, completely invisible to the cover
 * image's own HTTP cache-busting (dropCoverPath.ts) since that's a
 * different cache at a different layer — confirmed by the founder
 * still seeing an un-padded drop-3 quadrant even after that fix
 * shipped and the image itself was demonstrably no longer stale.
 * Any row older than this is treated as a miss and re-detected below,
 * which also re-caches it with a fresh computedAt — self-healing, no
 * manual DB access needed.
 *
 * Bumped again same day (2026-11-02T00:20Z): detectArtworkTrim's
 * sampling fit also changed (fill → cover, see its own comment) — a
 * second, independent reason a previously-cached value can be wrong,
 * so this needs to invalidate rows cached between the first bump and
 * now too, not just everything before today.
 */
const ARTWORK_TRIM_CACHE_VALID_SINCE = new Date("2026-11-02T00:20:00Z");

export async function getCachedArtworkTrim(url: string): Promise<number | null> {
  try {
    const [cached] = await getDb()
      .select({ trimPct: artworkTrimCache.trimPct, computedAt: artworkTrimCache.computedAt })
      .from(artworkTrimCache)
      .where(eq(artworkTrimCache.url, url))
      .limit(1);
    if (!cached || cached.computedAt < ARTWORK_TRIM_CACHE_VALID_SINCE) return null;
    return cached.trimPct;
  } catch {
    return null; // cache read failing is never worth blocking a render over
  }
}

export async function cacheArtworkTrim(url: string, trimPct: number): Promise<void> {
  try {
    // Upsert, not insert-only: a stale row (see
    // ARTWORK_TRIM_CACHE_VALID_SINCE above) reads as a miss and lands
    // right back here, so this has to overwrite the old row rather
    // than silently losing to the unique constraint on `url` the way a
    // plain insert-only write used to (which, before this change, left
    // a stale row's wrong value in place forever even once it was
    // re-detected — recomputed every request, cached never).
    await getDb()
      .insert(artworkTrimCache)
      .values({ url, trimPct })
      .onConflictDoUpdate({ target: artworkTrimCache.url, set: { trimPct, computedAt: new Date() } });
  } catch (err) {
    // Best-effort, same spirit as everywhere else in this file: worst
    // case this URL just gets re-detected next time instead of reading
    // from cache, never worth failing a page render over.
    console.error("[artworkTrim] cache write failed:", err);
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
