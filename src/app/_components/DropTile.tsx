import Link from "next/link";
import { artistHref } from "@/lib/artistLink";
import { TARGET_ARTWORK_TRIM } from "@/lib/artworkTrimMath";

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
  artworkTrims,
  quadrantArtists,
  hero,
  framed = true,
}: {
  num: number;
  artworkUrls: string[];
  /** Back in use as of 2026-11-03, round 2 — different job than before.
   * One entry per artworkUrls, same order (src/lib/artworkTrim.ts) — how
   * much of that image is a solid-color border baked into the file
   * itself, 0-to-~0.32.
   *
   * 2026-11-03's first round made every quadrant's matting a single flat
   * CSS `padding` (globals.css's .drop-tile-quad-slot) and stopped
   * reading this prop at all — which fixed the double-shrink bug, but
   * left an image with its OWN generous native border (Drop 1's own
   * files, e.g.) showing that border *on top of* the CSS padding: two
   * stacked margins, visibly more padded than a full-bleed sibling with
   * only the CSS one. Founder's own report, screenshot in hand.
   *
   * This prop is now used the opposite way round1 used it: not to ADD
   * padding to an under-bordered image, but to CANCEL an over-bordered
   * one's own native border by zooming in past it — see the per-quadrant
   * `scale` below — so every quadrant ends up full-bleed content-wise
   * and the CSS padding is every image's only visible margin, uniformly.
   * An image at or under TARGET_ARTWORK_TRIM is left alone either way:
   * the CSS padding alone already covers it. See dropCover.ts's
   * cropToFill() for the server-side equivalent (the downloaded cover
   * has no CSS, so it crops the actual pixels instead of transforming a
   * rendered <img>). */
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
          const trim = artworkTrims?.[i] ?? 0;
          // Only acts on an image with MORE native border than the
          // site's own uniform target — an image at or under it is left
          // at scale 1, since the CSS padding alone already gives it the
          // same margin every other quadrant gets. Zooms in just enough
          // to push the image's own border fully outside the frame
          // (1 / (1 - 2*trim) is the inverse of "this much of the frame
          // is border" — the same math DropTile used in the other
          // direction before the 2026-11-03 cleanup, just flipped).
          // .drop-tile-quad-slot's own `overflow: hidden` clips whatever
          // scaling past 100% pushes outside the slot.
          const scale = trim > TARGET_ARTWORK_TRIM ? 1 / (1 - 2 * trim) : 1;
          const quadStyle = scale > 1 ? { transform: `scale(${scale})` } : undefined;
          const art = url ? (
            // External Apple/Spotify CDN art — not worth configuring
            // next/image's remotePatterns for.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="drop-tile-quad" loading="lazy" style={quadStyle} />
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
