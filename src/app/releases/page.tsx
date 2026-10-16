import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/app/_components/SiteHeader";
import SignupPopup from "@/app/_components/SignupPopup";
import DropTile from "@/app/_components/DropTile";
import InfoTip from "@/app/_components/InfoTip";
import { getDefaultClub } from "@/lib/club";
import { getPublishedDrops, getPublicStats } from "@/lib/archive";
import { getDropStatus } from "@/lib/dropStatus";
import { formatDropMeta, formatScheduledDate } from "@/lib/format";
import { siteUrl } from "@/lib/site";

// Drops change whenever curators ship a new one — never freeze this
// at build time.
export const dynamic = "force-dynamic";

/**
 * Link-preview metadata for the home/releases page (2026-10-15 —
 * founder's own ask, "make it consistent for the link adding," once
 * the per-drop version shipped). Same idea as drop/[num]/page.tsx's
 * generateMetadata: a real description instead of the static layout
 * default, built from the same getPublicStats() totals already shown
 * on this page, so sharing the home link previews with real numbers.
 */
export async function generateMetadata(): Promise<Metadata> {
  const club = await getDefaultClub();
  const stats = await getPublicStats(club.id);
  const description =
    stats.dropCount > 0
      ? `${stats.dropCount} drops, ${stats.songCount} songs, from ${stats.artistCount} artists.`
      : "curated by jacob & friends";
  const pageUrl = siteUrl("/releases");

  // Link-preview title only (2026-10-16 — founder's own report:
  // "when sharing the releases, it says drop so far on the link, just
  // make it say releases"). The on-page <h1> a few lines down keeps its
  // own "Every drop so far" heading — that's a different, unrelated
  // piece of copy he didn't ask to change.
  return {
    title: "Releases",
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title: "Releases",
      description,
      url: pageUrl,
      siteName: "project music club",
    },
    twitter: {
      card: "summary",
      title: "Releases",
      description,
    },
  };
}

// Releases is the site's home page (design decision, 2026-10) — "/"
// just redirects here. Lived at /archive until 2026-10, when the URL
// (only — everything else, including this component's internals and
// the shared getPublishedDrops()/archive.ts naming, is unchanged) was
// renamed to /releases to match the nav label it already carried.
//
// The "Join the club" entry point (SignupPopup, despite its name — see
// that component) just links to /account now, same as the nav's
// Account item — /signup folded into /account in the 2026-10
// release-page redesign (see claude/next-build.md), so this page no
// longer needs its own copy of getSignupContext/the popup form.
export default async function ReleasesPage() {
  const club = await getDefaultClub();
  const [dropList, status, stats] = await Promise.all([
    getPublishedDrops(club.id),
    getDropStatus(club),
    getPublicStats(club.id),
  ]);

  // Public scheduled-date line (2026-10-08 "drop control" round —
  // founder's own answer, "yes they see it," to whether subscribers
  // should see a curator-set schedule). Only ever one of these two —
  // scheduledShipAt is only ever set on the currently-open drop,
  // nextDropOpensAt only ever meaningful when nothing's open — and
  // both are null (no line at all) whenever nothing's been scheduled,
  // same quiet-by-default spirit as the curator panel's own fields.
  const scheduleLine = status.scheduledShipAt
    ? `Drop ${status.current?.num} ships ${formatScheduledDate(status.scheduledShipAt)}.`
    : status.nextDropOpensAt
      ? `Next drop opens ${formatScheduledDate(status.nextDropOpensAt)}.`
      : null;

  return (
    <>
      <SiteHeader />
      <main className="col page gz-up">
        <h1 style={{ fontSize: 20, letterSpacing: "-0.02em", marginBottom: 12 }}>
          Every drop so far
          {dropList.length > 0 && (
            <InfoTip text="Top 10 ↗ = that drop's subscriber-vote results are posted. ♫ Listener Pick = extra songs people added beyond the curator's picks." />
          )}
        </h1>

        {/* Same big-inline-number treatment as the About page's totals
            line (2026-10-13 — founder's own ask, "add the drop numbers
            with songs/artists/drops like how i wanted," see
            claude/next-build.md). Reuses getPublicStats() and the
            .about-num class as-is. */}
        {dropList.length > 0 && (
          <p style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>
            <span className="about-num">{stats.dropCount}</span> drops,{" "}
            <span className="about-num">{stats.songCount}</span> songs, from{" "}
            <span className="about-num">{stats.artistCount}</span> artists.
          </p>
        )}

        {scheduleLine && (
          <p className="mut" style={{ fontSize: 12, marginTop: -4, marginBottom: 16 }}>
            {scheduleLine}
          </p>
        )}

        <SignupPopup />

        {dropList.length === 0 ? (
          <p className="empty-state">
            No drops yet — the first one is still being built.
          </p>
        ) : (
          <div className="archive-grid">
            {dropList.map((drop) => (
              <div key={drop.num} className="drop-card-wrap">
                <Link href={`/drop/${drop.num}`} className="drop-card">
                  <DropTile num={drop.num} artworkUrls={drop.artworkUrls} />
                  <div className="info">
                    <div className="title">
                      {drop.title ?? `Drop ${drop.num}`}
                      {drop.hasTop10 && <span className="top10-badge">Top 10 ↗</span>}
                    </div>
                    <div className="meta">{formatDropMeta(drop.publishedAt, drop.songCount)}</div>
                  </div>
                </Link>

                {/* Secondary "Listener Pick playlist" indicator (2026-10
                    release-page redesign — founder's chosen placement:
                    "i like how it shows in the archive page better",
                    adapted here to fit this page's compact tile grid
                    rather than the wider single-column card the mockup
                    assumed). Only a count lives here — never auto-built,
                    never sent out, built whenever a curator wants from
                    the dedicated listener-picks page this links to. */}
                {drop.listenerPickCount > 0 && (
                  <Link href={`/drop/${drop.num}/listener-picks`} className="listener-pick-pill">
                    ♫ Listener Pick ({drop.listenerPickCount}) →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
