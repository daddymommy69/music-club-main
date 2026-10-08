import Link from "next/link";
import SiteHeader from "@/app/_components/SiteHeader";
import SignupPopup from "@/app/_components/SignupPopup";
import DropTile from "@/app/_components/DropTile";
import { getDefaultClub } from "@/lib/club";
import { getPublishedDrops } from "@/lib/archive";
import { getDropStatus } from "@/lib/dropStatus";
import { formatDropMeta, formatScheduledDate } from "@/lib/format";

// Drops change whenever curators ship a new one — never freeze this
// at build time.
export const dynamic = "force-dynamic";

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
  const [dropList, status] = await Promise.all([getPublishedDrops(club.id), getDropStatus(club)]);

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
        </h1>

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
