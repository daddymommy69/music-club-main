/**
 * Pure constants/math shared by both the server (src/lib/artworkTrim.ts,
 * src/lib/dropCover.ts) and the client (src/app/_components/DropTile.tsx)
 * sides of the artwork-matting feature. Deliberately has zero imports —
 * no sharp, no db/client — so a client component can import trimScale()
 * without pulling server-only code (Postgres, sharp) into the browser
 * bundle. That exact mistake broke `next build` the same day this file
 * was added: DropTile.tsx importing trimScale from artworkTrim.ts dragged
 * in that file's `@/db/client` import transitively, and `postgres`
 * doesn't resolve in a browser bundle (`Can't resolve 'tls'`).
 */

// Cap how far in detectArtworkTrim() will ever report a border —
// guards against a false-positive detection (e.g. a genuinely
// solid-color album cover) eating the whole image.
export const MAX_ARTWORK_TRIM = 0.32;

/**
 * The matting level every drop's artwork should read as having —
 * grounded in real measurement of how Drop 1's art actually RENDERS,
 * not the raw file.
 *
 * First pass at this (2026-10-25, same day) used 0.3, measured by
 * running the border-detection algorithm directly on Drop 1's raw
 * source files, which came back ~0.31-0.32. That overshot badly — the
 * founder's report: Drop 2 came out "too small." Root cause: Drop 1's
 * files are landscape (1200x630), not square, and detectArtworkTrim()
 * measures the whole file before the site ever gets to it. On screen,
 * DropTile's <img> is object-fit:cover inside a square box, which (for
 * a landscape source) zooms in significantly and crops the left/right
 * edges — eating into most of that measured border before a pixel of
 * it ever reaches the page. So 0.31-0.32 was real, but it was never
 * the number to target: it's what the FILE looks like, not what Drop 1
 * actually LOOKS LIKE on musicclub.fyi.
 *
 * Corrected measurement: replicated the exact object-fit:cover crop
 * (same source dimensions, same square target box) in a canvas against
 * Drop 1's real files and re-ran the border scan on THAT — i.e. what a
 * visitor's browser actually paints. Three of four images came back a
 * consistent ~0.156 top/bottom/left; call it 0.15. (At 0.15, Drop 1's
 * own raw per-file trim, still ~0.31+, stays comfortably above this
 * target, so Drop 1 stays completely untouched either way — only the
 * Drop-2-side shrink amount changes.)
 *
 * This is a *floor* for every image's own rendered border, not an
 * amount to crop off every image. See trimScale() below: an image
 * that already meets or exceeds this (Drop 1's own files) is never
 * touched; only an image with *less* border than this (Drop 2's
 * files) gets shrunk to simulate having it.
 */
export const TARGET_ARTWORK_TRIM = 0.15;

/**
 * How much to shrink an image (via CSS scale() or an equivalent
 * resize-and-pad) so its own visible artwork occupies the same
 * proportion of its frame as one with exactly TARGET_ARTWORK_TRIM of
 * baked-in border would. Always <= 1 — this only ever adds margin to
 * an under-bordered image, never crops into one that already has
 * enough (or more) border than the target.
 */
export function trimScale(detectedTrim: number): number {
  return Math.min(1, (1 - 2 * TARGET_ARTWORK_TRIM) / (1 - 2 * detectedTrim));
}
