import Link from "next/link";
import SiteHeader from "@/app/_components/SiteHeader";
import { getDefaultClub } from "@/lib/club";
import { getPublishedDrops } from "@/lib/archive";
import { formatDropMeta } from "@/lib/format";

// Drops change whenever curators ship a new one — never freeze this
// at build time.
export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const club = await getDefaultClub();
  const dropList = await getPublishedDrops(club.id);

  return (
    <>
      <SiteHeader />
      <main className="col page gz-up">
        <h1 style={{ fontSize: 20, letterSpacing: "-0.02em", marginBottom: 24 }}>
          Every drop so far
        </h1>

        {dropList.length === 0 ? (
          <p className="empty-state">
            No drops yet — the first one is still being built.
          </p>
        ) : (
          <div className="archive-list">
            {dropList.map((drop) => (
              <Link key={drop.num} href={`/drop/${drop.num}`} className="drop-card">
                <div className="num">{String(drop.num).padStart(2, "0")}</div>
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
