import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { songs, drops, members } from "@/db/schema";

/**
 * Cross-drop leaderboard (2026-10 "next build" decision — see
 * claude/next-build.md): per member, a single combined tally of songs
 * they're the owner of — curatorId for a Curator Pick, submittedByMemberId
 * for a Listener Pick — counting only songs on SHIPPED drops
 * (publishedAt not null). Founder's explicit call: one combined count
 * per member, not separate curator/listener tallies. Public to everyone,
 * not curator-only.
 *
 * Fetches the raw rows and tallies in JS rather than a grouped SQL
 * query with a CASE-expression GROUP BY, matching this app's existing
 * convention for small-scale aggregation (see top10.ts's tallyTop10,
 * room.ts's per-curator grouping) — this club's whole history is a few
 * hundred songs at most, so an in-memory Map is simpler than fighting
 * Drizzle's grouping API over a computed column.
 */
export type LeaderboardRow = {
  memberId: number;
  name: string;
  isCurator: boolean;
  pickCount: number;
};

export async function getLeaderboard(clubId: number): Promise<LeaderboardRow[]> {
  const db = getDb();

  const rows = await db
    .select({
      pickType: songs.pickType,
      curatorId: songs.curatorId,
      submittedByMemberId: songs.submittedByMemberId,
    })
    .from(songs)
    .innerJoin(drops, eq(songs.dropId, drops.id))
    .where(and(eq(drops.clubId, clubId), isNotNull(drops.publishedAt)));

  const countByMemberId = new Map<number, number>();
  for (const row of rows) {
    const ownerId = row.pickType === "curator" ? row.curatorId : row.submittedByMemberId;
    // No owner at all (e.g. a legacy subscriber submission quick-added
    // with no curator ever claiming it) — not countable toward anyone.
    if (ownerId == null) continue;
    countByMemberId.set(ownerId, (countByMemberId.get(ownerId) ?? 0) + 1);
  }

  if (countByMemberId.size === 0) return [];

  const memberRows = await db
    .select({ id: members.id, name: members.name, isCurator: members.isCurator })
    .from(members)
    .where(inArray(members.id, [...countByMemberId.keys()]));

  return memberRows
    .map((m) => ({
      memberId: m.id,
      name: m.name ?? "",
      isCurator: m.isCurator,
      pickCount: countByMemberId.get(m.id) ?? 0,
    }))
    .sort((a, b) => b.pickCount - a.pickCount);
}
