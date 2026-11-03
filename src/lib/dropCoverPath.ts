/**
 * Builds the public drop-cover image URL path — zero imports (same
 * reason as artworkTrimMath.ts: CuratorToolsPanel.tsx, a client
 * component, links straight to this URL for its Download button, and
 * importing anything that drags in dropCover.ts's `sharp`/server-only
 * chain would break the client bundle the same way DropTile.tsx once
 * did).
 *
 * Carries a cache-busting `v` query param (2026-11-02 — founder's own
 * report: after fixing two real bugs in how this cover is built
 * (artwork selection, then matting), a re-download of drop 3's cover
 * came back byte-for-byte identical even in a private/incognito
 * window — because the route's own Cache-Control is
 * `public, max-age=31536000, immutable`, which Vercel's edge network
 * (not just the browser) honors, so the exact same URL just kept
 * serving its old cached response regardless of what the server-side
 * code now does. Bumping DROP_COVER_CACHE_VERSION changes every drop's
 * cover URL at once, which is a genuinely different cache entry to
 * Vercel's edge (and any other CDN) — no manual cache purge needed,
 * here or next time this code changes in a way that should actually
 * change already-shipped drops' output.
 *
 * Bump this whenever a change to dropCover.ts/artworkTrim.ts should
 * retroactively affect already-shipped drops' covers (not needed for a
 * change that only affects drops shipped after it, since those get a
 * fresh URL's first-ever request regardless).
 *
 * 2026-11-02T00:20Z fix (artworkTrim.ts's fit:"fill"→"cover" sampling
 * change) shipped without bumping this — an easy miss, since that fix
 * lives entirely in artworkTrim.ts/dropCover.ts and this constant
 * lives elsewhere, nothing wires them together. Confirmed by the
 * founder's next re-download coming back byte-for-byte identical to
 * the one before that fix even deployed: this file's own URL never
 * changed, so Vercel's edge cache just kept serving its old response
 * regardless of what the server could now compute. Bumping v here is
 * what actually makes a server-side fix visible, not the server-side
 * fix alone — every prior round in this file's history did this
 * together with its own fix; this one didn't, and that's the whole
 * bug.
 *
 * 2026-11-03: bumped for the tuner-driven padding/cream change —
 * shrinkAndPad's scale and matte color both changed (dropCover.ts),
 * which should retroactively repaint every already-shipped drop's
 * cover the same way the website's own tiles just did.
 *
 * 2026-11-03, round 2: bumped again — fetchQuadBuffer now crops into a
 * quadrant whose own file has more native border than the site's
 * uniform target (cropToFill(), via detectArtworkTrim()), instead of
 * just stacking the uniform pad on top of it. Changes already-shipped
 * drops with over-bordered art (Drop 1, at least).
 *
 * 2026-11-03, round 3 — REVERTED round 2: the per-image crop-to-fill
 * mechanism (founder's own report, screenshots in hand) both
 * mis-detected a dark-but-not-bordered quadrant as over-bordered
 * (Drop 3's Skrillex art lost its padding) and, on the website side,
 * interacted badly with .drop-tile-quad-slot's own overflow:hidden —
 * the scaled-up image bled past its content box into the padding area
 * instead of being cleanly cropped within it. dropCover.ts/DropTile.tsx
 * are back to the fixed, unconditional pad every quadrant got before
 * round 2 (same as Drop 2's confirmed-correct output) — bumped again so
 * every drop, Drop 1 included, goes back to that uniform look.
 */
export const DROP_COVER_CACHE_VERSION = 7;

export function dropCoverPath(dropNum: number): string {
  return `/api/drops/${dropNum}/cover?v=${DROP_COVER_CACHE_VERSION}`;
}
