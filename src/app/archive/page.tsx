import Link from "next/link";
import SiteHeader from "@/app/_components/SiteHeader";
import SignupPopup from "@/app/_components/SignupPopup";
import DropTile from "@/app/_components/DropTile";
import { getDefaultClub } from "@/lib/club";
import { getPublishedDrops } from "@/lib/archive";
import { getSignupContext } from "@/lib/signup";
import { formatDropMeta } from "@/lib/format";

// Drops change whenever curators ship a new one — never freeze this
// at build time.
export const dynamic = "force-dynamic";

// Releases is the site's home page (design decision, 2026-10) — "/"
// just redirects here. The sign-up popup lives on this page only: it
// shows itself once per visitor (tracked client-side in SignupPopup)
// and stays reachable after that through its own "Join the club"
// button. The dedicated /signup page is still there too.
export default async function ArchivePage() {
  const club = await getDefaultClub();
  const [dropList, signupCtx] = await Promise.all([
    getPublishedDrops(club.id),
    getSignupContext(club),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="col page gz-up">
        <h1 style={{ fontSize: 20, letterSpacing: "-0.02em", marginBottom: 12 }}>
          Every drop so far
        </h1>

        <SignupPopup
          nextDropNum={signupCtx.nextDropNum}
          daysUntilNext={signupCtx.daysUntilNext}
          isManual={signupCtx.isManual}
        />

        {dropList.length === 0 ? (
          <p className="empty-state">
            No drops yet — the first one is still being built.
          </p>
        ) : (
          <div className="archive-grid">
            {dropList.map((drop) => (
              <Link key={drop.num} href={`/drop/${drop.num}`} className="drop-card">
                <DropTile num={drop.num} artworkUrls={drop.artworkUrls} />
                <div className="info">
                  <div className="title">
                    {drop.title ?? `Drop ${drop.num}`}
                    {drop.hasTop10 && <span className="top10-badge">Top 10 ↗</span>}
                  </div>
                  <div className="meta">{formatDropMeta(drop.publishedAt, drop.songCount)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
