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
 *
 * 0.14 (2026-11-03, was 0.15, briefly 0.135) — founder's own final
 * value from the interactive padding/square/number tuner ("smaller
 * padding, larger artwork"). Drives the downloaded/Spotify cover's
 * matting (dropCover.ts, via trimScale() below); the website's own
 * matting is now a separate, plain CSS percentage on
 * .drop-tile-quad-slot (globals.css) kept at this same value by hand,
 * not by import — CSS can't read a TS constant. Change both together.
 */
export const TARGET_ARTWORK_TRIM = 0.14;

/**
 * Always returns the same fixed scale now, ignoring its argument —
 * founder's own call, 2026-11-02, after this used to vary the scale
 * per-image based on detectArtworkTrim()'s own guess at each image's
 * "native" border. That guess kept being wrong in new ways: first a
 * band photo's black negative space read as a deliberate matte
 * (leaving it un-padded next to its padded siblings), then — after
 * that was special-cased — an album cover's dark navy background did
 * the exact same thing. Rather than keep chasing one color at a time,
 * every image now gets shrunk by exactly this much and padded out to
 * TARGET_ARTWORK_TRIM, full stop, regardless of what's actually in the
 * file. Guarantees every quadrant in a cover grid (and every DropTile
 * on the site) matches, every time.
 *
 * Known tradeoff, accepted going in: Drop 1's own files were
 * deliberately left untouched by the old per-image logic (see
 * TARGET_ARTWORK_TRIM's own comment above) because they already had
 * MORE native border (~0.31-0.32) than the target — this now shrinks
 * them too, on top of their own existing generous matting, so Drop 1
 * specifically may read as more padded/smaller than it used to. Worth
 * a look next to the other drops once this ships.
 *
 * Keeps its (now-unused) parameter so its one remaining call site —
 * dropCover.ts — doesn't need touching; detectArtworkTrim above still
 * exists and still works correctly as a pure border-measurement
 * utility, it's just no longer trusted to drive the final rendered
 * scale. DropTile.tsx stopped calling this entirely (2026-11-03
 * cleanup) — the website's matting is plain CSS now, see
 * globals.css's .drop-tile-quad-slot.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for call-site compatibility, see comment above
export function trimScale(_detectedTrim: number): number {
  return 1 - 2 * TARGET_ARTWORK_TRIM;
}
