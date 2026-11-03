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
  /** DEAD as of 2026-11-03's padding cleanup — matting is now driven
   * entirely by .drop-tile-quad-slot's own CSS `padding` (globals.css),
   * the same amount for every quadrant regardless of what's in the
   * source file. This used to also drive a per-quadrant `transform:
   * scale()` here, computed from each image's own detected border
   * (src/lib/artworkTrim.ts) — that was a second, independent shrink
   * stacked on top of the CSS padding (double-matting), the actual bug
   * behind the founder's "drops don't all look uniform" report. Kept in
   * the type, still accepted and still passed by every caller (archive.ts,
   * DropDetail.tsx, account/page.tsx, releases/page.tsx), so none of
   * them need touching; just no longer read here. Safe to delete end to
   * end (including the artworkTrim.ts detection/DB-cache machinery it
   * fed) whenever that's wanted — nothing in this component depends on
   * it anymore. */
  artworkTrims?: number[];
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
            // next/image's remotePatterns for. No inline transform
            // here (2026-11-03 cleanup) — every quadrant's matting
            // comes from .drop-tile-quad-slot's own CSS padding alone
            // now, see that rule's comment in globals.css.
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
