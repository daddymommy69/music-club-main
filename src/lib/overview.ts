import { and, asc, count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { subscribers, submissions, curators, songs, type Club } from "@/db/schema";
import { getDropStatus } from "./dropStatus";

export type PileItem = {
  id: number;
  title: string | null;
  artist: string | null;
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
  dropNum: number;
  title: string | null;
  pickCount: number;
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
};

export async function getOverviewData(club: Club): Promise<OverviewData> {
  const db = getDb();
  const status = await getDropStatus(club);
  const openDropId = status.current && !status.current.publishedAt ? status.current.id : null;

  const [subscriberCountRows, pileRows, curatorRows, lifetimeCounts, cycleCounts, pickCountRows] =
    await Promise.all([
      db
        .select({ id: subscribers.id })
        .from(subscribers)
        .where(and(eq(subscribers.clubId, club.id), eq(subscribers.optedOut, false))),
      db
        .select()
        .from(submissions)
        .where(and(eq(submissions.clubId, club.id), eq(submissions.dropNum, status.nextDropNum)))
        .orderBy(desc(submissions.submittedAt)),
      db.select().from(curators).where(eq(curators.clubId, club.id)).orderBy(asc(curators.joinedAt)),
      db
        .select({ curatorId: songs.curatorId, value: count() })
        .from(songs)
        .innerJoin(curators, eq(songs.curatorId, curators.id))
        .where(eq(curators.clubId, club.id))
        .groupBy(songs.curatorId),
      openDropId
        ? db
            .select({ curatorId: songs.curatorId, value: count() })
            .from(songs)
            .innerJoin(curators, eq(songs.curatorId, curators.id))
            .where(and(eq(curators.clubId, club.id), eq(songs.dropId, openDropId)))
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
    name: c.name,
    picksThisCycle: cycleByCurator.get(c.id) ?? 0,
    picksLifetime: lifetimeByCurator.get(c.id) ?? 0,
    joinedAt: c.joinedAt,
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
            dropNum: status.current.num,
            title: status.current.title,
            pickCount: pickCountRows[0]?.value ?? 0,
          }
        : null,
  };
}
