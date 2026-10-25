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
 * grounded in real measurement, not a guess: fetching the founder's
 * own Drop 1 artwork files and running the border-detection algorithm
 * on them (2026-10-25) returned ~0.31-0.32 for every one of them
 * (several landing right at MAX_ARTWORK_TRIM above), while Drop 2's
 * full-bleed files returned ~0-0.06. So 0.3 — just under Drop 1's own
 * measured floor — is "Drop 1's actual look," matching the founder's
 * "i want drop 1 to be the standard."
 *
 * IMPORTANT — this is a *floor* for every image's own border, not an
 * amount to crop off every image. See trimScale() below: an image
 * that already meets or exceeds this (Drop 1's own files) is never
 * touched; only an image with *less* border than this (Drop 2's
 * files) gets shrunk to simulate having it. An earlier same-day round
 * applied each image's own detected trim as an unconditional zoom-in
 * amount instead — which stripped Drop 1's real matting down toward
 * Drop 2's tighter look rather than bringing Drop 2 up to match Drop 1.
 */
export const TARGET_ARTWORK_TRIM = 0.3;

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
