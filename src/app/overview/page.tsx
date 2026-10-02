import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionCuratorId } from "@/lib/curatorSession";
import { getCuratorById } from "@/lib/curators";
import { getDefaultClub } from "@/lib/club";
import { getOverviewData } from "@/lib/overview";
import { getTargetDropForTop10, getTop10Summary } from "@/lib/top10Data";
import CuratorNav from "@/app/_components/CuratorNav";
import LogoutButton from "@/app/_components/LogoutButton";
import OverviewBoard from "@/app/_components/OverviewBoard";
import Top10Card from "@/app/_components/Top10Card";
import ShipDropCard from "@/app/_components/ShipDropCard";

export const dynamic = "force-dynamic";

// #/overview (design-handoff.md §8): curator dashboard. Stat row, the
// submission pile (the one place submitter identity is visible — curators
// need it to dedupe and spot abuse), quick-add into picks, curator roster.
export default async function OverviewPage() {
  const curatorId = await getSessionCuratorId();
  if (!curatorId) redirect("/curators");

  const curator = await getCuratorById(curatorId);
  if (!curator) redirect("/curators");

  const club = await getDefaultClub();
  const data = await getOverviewData(club);

  // "pending"/"open"/"closed" only — "not-shipped" means nothing's ever
  // gone out yet, so there's nothing for the card to show.
  const top10Drop = await getTargetDropForTop10(club.id);
  const top10Summary = top10Drop ? await getTop10Summary(top10Drop) : null;
  const top10Visible =
    top10Summary && top10Summary.phase !== "not-shipped" && top10Summary.window ? top10Summary : null;

  return (
    <main className="shell page">
      <Link href="/" className="wordmark" style={{ display: "block", marginBottom: 4 }}>
        project music club
      </Link>
      <p className="mut" style={{ fontSize: 11.5, marginBottom: 16 }}>
        Curator overview
      </p>
      <CuratorNav />

      <OverviewBoard
        dropNum={data.dropNum}
        isManual={data.isManual}
        daysUntilNext={data.daysUntilNext}
        hasOpenDrop={data.hasOpenDrop}
        subscriberCount={data.subscriberCount}
        pile={data.pile.map((p) => ({
          id: p.id,
          title: p.title,
          artist: p.artist,
          link: p.link,
          submittedBy: p.submittedBy,
          submittedAt: p.submittedAt.toISOString(),
          pulledAt: p.pulledAt ? p.pulledAt.toISOString() : null,
        }))}
        roster={data.roster.map((c) => ({
          id: c.id,
          name: c.name,
          picksThisCycle: c.picksThisCycle,
          picksLifetime: c.picksLifetime,
          joinedAt: c.joinedAt.toISOString(),
        }))}
      />

      {data.shipCandidate && (
        <ShipDropCard
          dropNum={data.shipCandidate.dropNum}
          title={data.shipCandidate.title}
          pickCount={data.shipCandidate.pickCount}
        />
      )}

      {top10Visible && (
        <Top10Card
          dropNum={top10Visible.dropNum}
          phase={top10Visible.phase as "pending" | "open" | "closed"}
          opensAt={top10Visible.window!.opensAt.toISOString()}
          closesAt={top10Visible.window!.closesAt.toISOString()}
          tally={top10Visible.tally}
          hitThreshold={top10Visible.hitThreshold}
          spotifyUrl={top10Visible.spotifyUrl}
          appleUrl={top10Visible.appleUrl}
        />
      )}

      <div style={{ marginTop: 28 }}>
        <LogoutButton />
      </div>
    </main>
  );
}
