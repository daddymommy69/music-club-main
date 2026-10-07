import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { songLikes, dropLikes, dropSaves, songs, drops } from "@/db/schema";

/**
 * A member's "Your activity" feed on /account (2026-10 account
 * consolidation round — see claude/next-build.md). Merges three
 * previously-invisible-to-the-member actions into one reverse-
 * chronological list: liking a song, liking a whole drop, and saving a
 * whole drop. All three already had working toggle endpoints
 * (src/lib/songLikes.ts, dropLikes.ts, dropSaves.ts) before this —
 * nothing changed about how a like/save is recorded, this is purely a
 * new read showing the member what they already did.
 */

export type ActivityItem =
  | { kind: "song-like"; at: Date; songId: number; title: string; artist: string; dropNum: number }
  | { kind: "drop-like"; at: Date; dropId: number; dropNum: number; dropTitle: string | null }
  | { kind: "drop-save"; at: Date; dropId: number; dropNum: number; dropTitle: string | null };

/**
 * Each of the three sources is queried with its own `limit` (not a
 * shared budget) and the merged, re-sorted result is then trimmed to
 * `limit` — simplest correct way to guarantee the final list is truly
 * the member's N most recent actions regardless of which source they
 * came from, at the cost of occasionally over-fetching one or two
 * sources. Activity lists are short (`limit` is small) so that's cheap.
 */
export async function getMemberActivity(memberId: number, limit: number): Promise<ActivityItem[]> {
  const db = getDb();

  const [songLikeRows, dropLikeRows, dropSaveRows] = await Promise.all([
    db
      .select({
        at: songLikes.createdAt,
        songId: songs.id,
        title: songs.title,
        artist: songs.artist,
        dropNum: drops.num,
      })
      .from(songLikes)
      .innerJoin(songs, eq(songLikes.songId, songs.id))
      .innerJoin(drops, eq(songs.dropId, drops.id))
      .where(eq(songLikes.memberId, memberId))
      .orderBy(desc(songLikes.createdAt))
      .limit(limit),
    db
      .select({
        at: dropLikes.createdAt,
        dropId: drops.id,
        dropNum: drops.num,
        dropTitle: drops.title,
      })
      .from(dropLikes)
      .innerJoin(drops, eq(dropLikes.dropId, drops.id))
      .where(eq(dropLikes.memberId, memberId))
      .orderBy(desc(dropLikes.createdAt))
      .limit(limit),
    db
      .select({
        at: dropSaves.createdAt,
        dropId: drops.id,
        dropNum: drops.num,
        dropTitle: drops.title,
      })
      .from(dropSaves)
      .innerJoin(drops, eq(dropSaves.dropId, drops.id))
      .where(eq(dropSaves.memberId, memberId))
      .orderBy(desc(dropSaves.createdAt))
      .limit(limit),
  ]);

  const items: ActivityItem[] = [
    ...songLikeRows.map((r) => ({
      kind: "song-like" as const,
      at: r.at,
      songId: r.songId,
      title: r.title,
      artist: r.artist,
      dropNum: r.dropNum,
    })),
    ...dropLikeRows.map((r) => ({
      kind: "drop-like" as const,
      at: r.at,
      dropId: r.dropId,
      dropNum: r.dropNum,
      dropTitle: r.dropTitle,
    })),
    ...dropSaveRows.map((r) => ({
      kind: "drop-save" as const,
      at: r.at,
      dropId: r.dropId,
      dropNum: r.dropNum,
      dropTitle: r.dropTitle,
    })),
  ];

  items.sort((a, b) => b.at.getTime() - a.at.getTime());
  return items.slice(0, limit);
}
