import { and, asc, count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { members, submissions, songs, drops, type Club } from "@/db/schema";
import { getDropStatus } from "./dropStatus";

export type PileItem = {
  id: number;
  title: string | null;
  artist: string | null;
  // Already selected off `submissions.artwork_url` (the `.select()`
  // below has no column list) — just never typed/exposed until now
  // (2026-10-08 curator tools redesign, see claude/next-build.md: the
  // pile grows a thumbnail, same artwork a submission already carries
  // when it came in via Browse's search).
  artworkUrl: string | null;
  link: string;
  submittedBy: string | null;
  submittedAt: Date;
  pulledAt: Date | null;
};

export type RosterCurator = {
  id: number;
  name: string;
  picksThisCycle: number;
  picksLifetime: number;
  joinedAt: Date;
};

export type ShipCandidate = {
  dropId: number;
  dropNum: number;
  title: string | null;
  pickCount: number;
  /** Short "who did what" history (2026-10-08 "drop control" round —
   * see claude/next-build.md) — whichever of these are set render as a
   * single line each in the Manage-this-drop panel. */
  startedBy: string | null;
  startedAt: Date;
  titleUpdatedBy: string | null;
  titleUpdatedAt: Date | null;
  scheduledShipAt: Date | null;
};

/** A drop a curator canceled that's still eligible to be un-canceled —
 * only true when it's still the highest-numbered drop for the club
 * (nothing newer was started since), matching the guard the uncancel
 * route itself enforces. */
export type CanceledDrop = {
  num: number;
  title: string | null;
  canceledBy: string | null;
  canceledAt: Date;
};

export type OverviewData = {
  dropNum: number;
  daysUntilNext: number | null;
  isManual: boolean;
  hasOpenDrop: boolean;
  subscriberCount: number;
  pile: PileItem[];
  roster: RosterCurator[];
  /** The open drop, ready to have its playlist link(s) pasted in and
   * shipped — null when there's nothing open right now (see the ship
   * card on /overview, src/app/api/overview/ship). */
  shipCandidate: ShipCandidate | null;
  /** Curator-scheduled auto-open date for the next drop — only ever
   * meaningful when there's no open drop right now. */
  nextDropOpensAt: Date | null;
  canceledDrop: CanceledDrop | null;
};

export async function getOverviewData(club: Club): Promise<OverviewData> {
  const db = getDb();
  const status = await getDropStatus(club);
  const openDropId = status.current && !status.current.publishedAt ? status.current.id : null;

  // A canceled drop is only eligible to be un-canceled while it's still
  // the TRUE highest-numbered drop for the club, canceled or not — the
  // exact same check /api/overview/uncancel itself enforces (if a
  // newer drop has since been started, reopening this one would create
  // two "open" drops at once). So: look at the real highest-num row
  // directly (no canceled filter), not status.current (which already
  // excludes canceled rows and could otherwise point at an older,
  // already-shipped drop instead).
  const latestDropRows = await db
    .select()
    .from(drops)
    .where(eq(drops.clubId, club.id))
    .orderBy(desc(drops.num))
    .limit(1);
  const latestDrop = latestDropRows[0] ?? null;
  const canceledDrop: CanceledDrop | null =
    latestDrop && latestDrop.canceledAt
      ? {
          num: latestDrop.num,
          title: latestDrop.title,
          canceledBy: latestDrop.canceledBy,
          canceledAt: latestDrop.canceledAt,
        }
      : null;

  const [subscriberCountRows, pileRows, curatorRows, lifetimeCounts, cycleCounts, pickCountRows] =
    await Promise.all([
      // "Subscriber" count here still means every active member — the
      // overview stat predates the unified account model and isCurator
      // doesn't exclude someone from this count, same as before.
      db
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.clubId, club.id), eq(members.optedOut, false))),
      db
        .select()
        .from(submissions)
        .where(and(eq(submissions.clubId, club.id), eq(submissions.dropNum, status.nextDropNum)))
        .orderBy(desc(submissions.submittedAt)),
      // Only members with isCurator — the old `curators` table only ever
      // held curators, so selecting from the unified `members` table
      // without this filter would pull in every subscriber too.
      db
        .select()
        .from(members)
        .where(and(eq(members.clubId, club.id), eq(members.isCurator, true)))
        .orderBy(asc(members.createdAt)),
      db
        .select({ curatorId: songs.curatorId, value: count() })
        .from(songs)
        .innerJoin(members, eq(songs.curatorId, members.id))
        .where(eq(members.clubId, club.id))
        .groupBy(songs.curatorId),
      openDropId
        ? db
            .select({ curatorId: songs.curatorId, value: count() })
            .from(songs)
            .innerJoin(members, eq(songs.curatorId, members.id))
            .where(and(eq(members.clubId, club.id), eq(songs.dropId, openDropId)))
            .groupBy(songs.curatorId)
        : Promise.resolve([]),
      // Total tracklist count for the open drop — every song regardless of
      // curatorId, not just the per-curator groupby above, since a pick
      // pulled in with no owner still ships with the playlist.
      openDropId
        ? db.select({ value: count() }).from(songs).where(eq(songs.dropId, openDropId))
        : Promise.resolve([{ value: 0 }]),
    ]);

  const lifetimeByCurator = new Map<number, number>();
  for (const row of lifetimeCounts) {
    if (row.curatorId == null) continue;
    lifetimeByCurator.set(row.curatorId, row.value);
  }
  const cycleByCurator = new Map<number, number>();
  for (const row of cycleCounts) {
    if (row.curatorId == null) continue;
    cycleByCurator.set(row.curatorId, row.value);
  }

  const roster: RosterCurator[] = curatorRows.map((c) => ({
    id: c.id,
    // members.name is nullable (unlike the old curators.name, which was
    // required) — coalesce so RosterCurator.name stays a plain string.
    name: c.name ?? "",
    picksThisCycle: cycleByCurator.get(c.id) ?? 0,
    picksLifetime: lifetimeByCurator.get(c.id) ?? 0,
    // members has no joinedAt column (it has createdAt) — same value,
    // new column name post-unification.
    joinedAt: c.createdAt,
  }));

  return {
    dropNum: status.nextDropNum,
    daysUntilNext: status.daysUntilNext,
    isManual: status.isManual,
    hasOpenDrop: openDropId != null,
    subscriberCount: subscriberCountRows.length,
    pile: pileRows,
    roster,
    shipCandidate:
      openDropId && status.current
        ? {
            dropId: status.current.id,
            dropNum: status.current.num,
            title: status.current.title,
            pickCount: pickCountRows[0]?.value ?? 0,
            startedBy: status.current.startedBy,
            startedAt: status.current.createdAt,
            titleUpdatedBy: status.current.titleUpdatedBy,
            titleUpdatedAt: status.current.titleUpdatedAt,
            scheduledShipAt: status.current.scheduledShipAt,
          }
        : null,
    nextDropOpensAt: status.nextDropOpensAt,
    canceledDrop,
  };
}
