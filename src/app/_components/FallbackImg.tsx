"use client";

import { useState } from "react";

/**
 * Re-crops an Apple/mzstatic artwork URL to a square 600x600 if it's
 * using the wide "wp" link-preview format (2026-10-07, round 4 — the
 * ACTUAL bug behind every "artwork still looks framed" report this
 * whole round: Odesli's thumbnailUrl for an Apple Music entity is
 * sometimes mzstatic's 1200x630 social-link-preview crop, not the
 * square cover — genuinely not square, so no CSS fix could ever touch
 * it; see odesli.ts's own squareArtworkUrl for the full story). Fixed
 * at the source for anything submitted from here on, but this is the
 * retroactive half — it re-squares every ALREADY-STORED bad URL at
 * display time too, no database backfill needed. Safe no-op on
 * anything that isn't this exact mzstatic shape (Spotify URLs, an
 * already-square mzstatic "bb" URL, etc.).
 */
function squareArtworkUrl(url: string): string {
  return url.replace(/\/\d+x\d+(?:bb|wp)(?:-\d+)?\.(jpg|png)$/i, "/600x600bb.$1");
}

/**
 * A plain <img> that swaps to the same gradient placeholder the rest
 * of the app already uses for "no artwork" the moment it fails to
 * load (2026-10-07, round 3 — a dead/expired artwork URL renders the
 * browser's own native broken-image box, which reads exactly like an
 * unwanted frame around otherwise-borderless artwork, and no CSS
 * change here can touch that). Every other artwork spot already falls
 * back this way when the URL field itself is empty; this just extends
 * the same fallback to a URL that exists but 404s/CORS-fails at the
 * browser level.
 */
export default function FallbackImg({
  src,
  alt = "",
  className,
  fallbackClassName,
}: {
  src: string;
  alt?: string;
  className: string;
  fallbackClassName: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <div className={fallbackClassName} aria-hidden="true" />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={squareArtworkUrl(src)}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
