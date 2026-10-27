import { redirect } from "next/navigation";
import SiteHeader from "@/app/_components/SiteHeader";
import CuratorToolsPanel, { type CuratorToolsPanelProps } from "@/app/_components/CuratorToolsPanel";
import { getDefaultClub } from "@/lib/club";
import { getSessionMember } from "@/lib/memberSession";
import { getOpenDrop, getRoomData } from "@/lib/room";
import { getOverviewData } from "@/lib/overview";
import { getDropNotes, getSongNotesForDrop, type NoteRow } from "@/lib/notes";
import { getTargetDropForTop10, getTop10Summary } from "@/lib/top10Data";
import { getPublishedDrops, getDropsMissingPlaylist } from "@/lib/archive";
import type { Club, Drop } from "@/db/schema";

/**
 * Everything CuratorToolsPanel needs, serialized to plain JSON-friendly
 * props — moved here unchanged from account/page.tsx (2026-10-23 "curator
 * tools revamp" — see claude/next-build.md) when the embedded workspace
 * got its own top-level /curator page instead of living as a buried
 * sub-tab of /account. Same shape /room's and /overview's page.tsx used
 * to build for RoomBoard/OverviewBoard before those pages were folded
 * into /account in the first place.
 */
async function getCuratorToolsProps(
  club: Club,
  openDrop: Drop | null,
  viewerId: number,
  publishedDrops: { num: number; title: string | null; appleUrl: string | null }[]
): Promise<CuratorToolsPanelProps> {
  const [overview, room, top10Drop, dropsMissingPlaylist, dropNoteRows, songNoteMap] = await Promise.all([
    getOverviewData(club),
    openDrop ? getRoomData(club, openDrop) : Promise.resolve(null),
    getTargetDropForTop10(club.id),
    getDropsMissingPlaylist(club.id),
    openDrop ? getDropNotes(openDrop.id) : Promise.resolve([] as NoteRow[]),
    openDrop ? getSongNotesForDrop(openDrop.id) : Promise.resolve({} as Record<number, NoteRow[]>),
  ]);
  const top10Summary = top10Drop ? await getTop10Summary(top10Drop) : null;
  const top10Visible =
    top10Summary && top10Summary.phase !== "not-shipped" && top10Summary.window ? top10Summary : null;

  // Flat, drop-ordered "this cycle's picks" list (2026-10-08 curator
  // tools redesign, see claude/next-build.md) — replaces the old
  // per-curator Columns/Stream breakdown, which nobody on the team had
  // actually used. room.curators is still the source (one query, same
  // as before), just flattened and re-sorted by when each pick was
  // actually added rather than grouped by who added it.
  const picks = room
    ? room.curators
        .flatMap((c) => c.picks.map((p) => ({ ...p, curatorName: c.curator.name ?? "" })))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((p) => ({
          id: p.id,
          title: p.title,
          artist: p.artist,
          artworkUrl: p.artworkUrl,
          sourceUrl: p.sourceUrl,
          curatorCredit: p.curatorName,
        }))
    : [];

  return {
    dropNum: overview.dropNum,
    isManual: overview.isManual,
    daysUntilNext: overview.daysUntilNext,
    hasOpenDrop: overview.hasOpenDrop,
    subscriberCount: overview.subscriberCount,
    pile: overview.pile.map((p) => ({
      id: p.id,
      title: p.title,
      artist: p.artist,
      artworkUrl: p.artworkUrl,
      link: p.link,
      submittedBy: p.submittedBy,
      submittedAt: p.submittedAt.toISOString(),
      pulledAt: p.pulledAt ? p.pulledAt.toISOString() : null,
    })),
    roster: overview.roster.map((c) => ({
      id: c.id,
      name: c.name,
      picksThisCycle: c.picksThisCycle,
      picksLifetime: c.picksLifetime,
      joinedAt: c.joinedAt.toISOString(),
    })),
    picks,
    shipCandidate: overview.shipCandidate
      ? {
          dropId: overview.shipCandidate.dropId,
          dropNum: overview.shipCandidate.dropNum,
          title: overview.shipCandidate.title,
          pickCount: overview.shipCandidate.pickCount,
          startedBy: overview.shipCandidate.startedBy,
          startedAt: overview.shipCandidate.startedAt.toISOString(),
          titleUpdatedBy: overview.shipCandidate.titleUpdatedBy,
          titleUpdatedAt: overview.shipCandidate.titleUpdatedAt
            ? overview.shipCandidate.titleUpdatedAt.toISOString()
            : null,
          scheduledShipAt: overview.shipCandidate.scheduledShipAt
            ? overview.shipCandidate.scheduledShipAt.toISOString()
            : null,
        }
      : null,
    nextDropOpensAt: overview.nextDropOpensAt ? overview.nextDropOpensAt.toISOString() : null,
    canceledDrop: overview.canceledDrop
      ? {
          num: overview.canceledDrop.num,
          title: overview.canceledDrop.title,
          canceledBy: overview.canceledDrop.canceledBy,
          canceledAt: overview.canceledDrop.canceledAt.toISOString(),
        }
      : null,
    top10: top10Visible
      ? {
          dropNum: top10Visible.dropNum,
          phase: top10Visible.phase as "pending" | "open" | "closed",
          opensAt: top10Visible.window!.opensAt.toISOString(),
          closesAt: top10Visible.window!.closesAt.toISOString(),
          tally: top10Visible.tally,
          hitThreshold: top10Visible.hitThreshold,
          spotifyUrl: top10Visible.spotifyUrl,
          appleUrl: top10Visible.appleUrl,
        }
      : null,
    dropsMissingPlaylist,
    // "Mine" lets the feed show Edit/Delete only on the viewer's own
    // posts, without the client ever needing to know its own member id
    // for anything else (2026-10-16 — see CuratorToolsPanel.tsx's
    // BlurbFeed). Dates serialize to ISO strings crossing the server/
    // client boundary, same as every other date in this props object.
    dropNotes: dropNoteRows.map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
      mine: n.curatorId === viewerId,
    })),
    songNotes: Object.fromEntries(
      Object.entries(songNoteMap).map(([songId, notes]) => [
        songId,
        notes.map((n) => ({
          ...n,
          createdAt: n.createdAt.toISOString(),
          updatedAt: n.updatedAt.toISOString(),
          mine: n.curatorId === viewerId,
        })),
      ])
    ),
    // Powers the "Drop options" list (2026-10-18, extended 2026-10-27
    // with appleUrl for the always-editable Apple Music link field).
    // The fuller publishedDrops the caller already fetched carries more
    // than this panel needs — just num/title/appleUrl here.
    publishedDrops: publishedDrops.map((d) => ({ num: d.num, title: d.title, appleUrl: d.appleUrl })),
  };
}

export const dynamic = "force-dynamic";

/**
 * /curator (2026-10-23 "curator tools revamp" — founder's own ask,
 * replacing the old buried Account → Curator-tools sub-tab entirely, see
 * claude/next-build.md). Gated the same way /settings already is: no
 * session, or a session that isn't a curator, bounces to /curators —
 * there's nothing to show a non-curator here, not even a read-only
 * peek, same as before.
 */
export default async function CuratorPage() {
  const member = await getSessionMember();
  if (!member || !member.isCurator) redirect("/curators");

  const club = await getDefaultClub();
  const openDrop = await getOpenDrop(club);
  const publishedDrops = await getPublishedDrops(club.id);
  const curatorTools = await getCuratorToolsProps(club, openDrop, member.id, publishedDrops);

  return (
    <>
      <SiteHeader />
      <main className="col page">
        <CuratorToolsPanel {...curatorTools} />
      </main>
    </>
  );
}
