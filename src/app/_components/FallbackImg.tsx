"use client";

import { useState } from "react";

/**
 * A plain <img> that swaps to the same gradient placeholder the rest
 * of the app already uses for "no artwork" the moment it fails to
 * load (2026-10-07, round 3 — a real candidate for the "artwork still
 * has a frame" reports: a dead/expired artwork URL renders the
 * browser's own native broken-image box, which reads exactly like an
 * unwanted frame around otherwise-borderless artwork, and no CSS
 * change here can touch that — this is the actual fix for that case).
 * Every other artwork spot already falls back this way when the URL
 * field itself is empty; this just extends the same fallback to a URL
 * that exists but 404s/CORS-fails at the browser level.
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
    <img src={src} alt={alt} className={className} loading="lazy" onError={() => setFailed(true)} />
  );
}
