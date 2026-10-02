import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionCuratorId } from "@/lib/curatorSession";
import { getCuratorById } from "@/lib/curators";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop, getRoomData } from "@/lib/room";
import LogoutButton from "@/app/_components/LogoutButton";
import RoomBoard from "@/app/_components/RoomBoard";
import CuratorNav from "@/app/_components/CuratorNav";

export const dynamic = "force-dynamic";

// #/room (design-handoff.md §7): where the drop gets built. Private to
// curators until it ships. Columns/stream views, add-a-pick, per-curator
// notes, and a curator-only comment thread.
export default async function RoomPage() {
  const curatorId = await getSessionCuratorId();
  if (!curatorId) redirect("/curators");

  const curator = await getCuratorById(curatorId);
  if (!curator) redirect("/curators");

  const club = await getDefaultClub();
  const drop = await getOpenDrop(club);

  if (!drop) {
    return (
      <main className="shell page">
        <Link href="/" className="wordmark" style={{ display: "block", marginBottom: 4 }}>
          project music club
        </Link>
        <p className="mut" style={{ fontSize: 11.5, marginBottom: 16 }}>
          Curator room
        </p>
        <CuratorNav />
        <div className="empty-state">
          No drop in progress right now — check back once the next one starts.
        </div>
        <div style={{ marginTop: 20 }}>
          <LogoutButton />
        </div>
      </main>
    );
  }

  const data = await getRoomData(club, drop);

  return (
    <main className="shell page">
      <CuratorNav />
      <RoomBoard
        clubName={club.name}
        dropNum={data.drop.num}
        isManual={data.isManual}
        daysUntilNext={data.daysUntilNext}
        meId={curator.id}
        meName={curator.name}
        curators={data.curators.map((c) => ({
          id: c.curator.id,
          name: c.curator.name,
          picks: c.picks.map((p) => ({
            id: p.id,
            title: p.title,
            artist: p.artist,
            sourceUrl: p.sourceUrl,
          })),
          note: c.note,
          lastActivity: c.lastActivity ? c.lastActivity.toISOString() : null,
        }))}
        comments={data.comments.map((c) => ({
          id: c.id,
          curatorId: c.curatorId,
          curatorName: c.curatorName,
          text: c.text,
          createdAt: c.createdAt.toISOString(),
        }))}
        stream={data.stream.map((item) =>
          item.kind === "pick"
            ? {
                kind: "pick" as const,
                at: item.at.toISOString(),
                curatorName: item.curatorName,
                title: item.pick.title,
                artist: item.pick.artist,
              }
            : {
                kind: "note" as const,
                at: item.at.toISOString(),
                curatorName: item.curatorName,
                text: item.text,
              }
        )}
      />
    </main>
  );
}
