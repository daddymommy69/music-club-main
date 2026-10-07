import Link from "next/link";
import { artistHref } from "@/lib/artistLink";

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
  quadrantArtists,
  hero,
  framed = true,
}: {
  num: number;
  artworkUrls: string[];
  /** Each quadrant's own artist, same order as artworkUrls (2026-10-07
   * — see claude/next-build.md) — when given, every quadrant links to
   * that artist's page instead of being plain decoration. Only passed
   * by the drop-detail hero tile: the archive/account grid usages wrap
   * the whole tile in a Link to the drop itself already, and a nested
   * link inside that would be invalid. */
  quadrantArtists?: string[];
  /** Larger standalone variant for the drop-detail header. */
  hero?: boolean;
  /** The bordered-card look (2026-10-07, round 3 — the founder's own
   * call: keep it on /releases, the component's original home, but
   * not on the other two places this tile gets reused). Defaults to
   * true so /releases' own usage doesn't need to pass anything. */
  framed?: boolean;
}) {
  const quads = Array.from({ length: 4 }, (_, i) => artworkUrls[i] ?? null);

  return (
    <div className={`drop-tile${hero ? " drop-tile-hero" : ""}${framed ? " drop-tile-framed" : ""}`}>
      <div className="drop-tile-grid">
        {quads.map((url, i) => {
          const art = url ? (
            // External Apple/Spotify CDN art — not worth configuring
            // next/image's remotePatterns for.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="drop-tile-quad" loading="lazy" />
          ) : (
            <div className="drop-tile-quad drop-tile-quad-empty" aria-hidden="true" />
          );
          const artist = quadrantArtists?.[i];
          return (
            <div key={i} className="drop-tile-quad-slot">
              {artist ? <Link href={artistHref(artist)}>{art}</Link> : art}
            </div>
          );
        })}
      </div>
      <div className="drop-tile-num">
        <span>{String(num).padStart(2, "0")}</span>
      </div>
    </div>
  );
}
