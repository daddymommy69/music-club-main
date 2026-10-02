/**
 * The square number+artwork tile (design decision, 2026-10): a 2x2
 * collage of the first 4 songs' cover art with the drop number
 * overlaid in the middle, the way Spotify/Apple build a cover out of
 * a playlist's own tracks. Reused on the Releases grid and at the top
 * of a drop's own page — same component, just a size class.
 *
 * Always renders 4 quadrants even with fewer than 4 songs/artworks:
 * a missing quadrant falls back to a plain fill tile rather than
 * leaving a gap, so the shape stays consistent everywhere it's used.
 */
export default function DropTile({
  num,
  artworkUrls,
  hero,
}: {
  num: number;
  artworkUrls: string[];
  /** Larger standalone variant for the drop-detail header. */
  hero?: boolean;
}) {
  const quads = Array.from({ length: 4 }, (_, i) => artworkUrls[i] ?? null);

  return (
    <div className={`drop-tile${hero ? " drop-tile-hero" : ""}`}>
      <div className="drop-tile-grid">
        {quads.map((url, i) =>
          url ? (
            // External Apple/Spotify CDN art — not worth configuring
            // next/image's remotePatterns for.
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={url} alt="" className="drop-tile-quad" loading="lazy" />
          ) : (
            <div key={i} className="drop-tile-quad drop-tile-quad-empty" aria-hidden="true" />
          )
        )}
      </div>
      <div className="drop-tile-num">
        <span>{String(num).padStart(2, "0")}</span>
      </div>
    </div>
  );
}
