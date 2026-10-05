import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { songLikes } from "@/db/schema";
import { isUniqueViolation } from "./normalize";

/**
 * Song likes (2026-10 "next build" decision — see claude/next-build.md).
 * The `song_likes` table has existed since the members unification but
 * had no UI wired to it until now — this is that wiring's lib layer.
 * Public: the like count shows on the song itself, not a private-only
 * favorites list.
 */

/** Flips the member's like on a song. Returns the resulting liked state (not just "did a write happen"). */
export async function toggleSongLike(songId: number, memberId: number): Promise<{ liked: boolean }> {
  const db = getDb();
  const existing = await db
    .select({ id: songLikes.id })
    .from(songLikes)
    .where(and(eq(songLikes.songId, songId), eq(songLikes.memberId, memberId)))
    .limit(1);

  if (existing[0]) {
    await db.delete(songLikes).where(eq(songLikes.id, existing[0].id));
    return { liked: false };
  }

  try {
    await db.insert(songLikes).values({ songId, memberId });
    return { liked: true };
  } catch (err) {
    // Lost a race with a second like click on the same song — the
    // table's unique constraint (songId, memberId) caught it. Either
    // way the end state is "liked", so treat it as a success rather
    // than an error, same recovery spirit as isUniqueViolation's other
    // call sites in this app.
    if (isUniqueViolation(err)) return { liked: true };
    throw err;
  }
}

/** Like counts for every song in a drop, keyed by songId. Songs with zero likes are simply absent from the map. */
export async function getLikeCounts(songIds: number[]): Promise<Map<number, number>> {
  if (songIds.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select({ songId: songLikes.songId })
    .from(songLikes)
    .where(inArray(songLikes.songId, songIds));

  const counts = new Map<number, number>();
  for (const row of rows) {
    counts.set(row.songId, (counts.get(row.songId) ?? 0) + 1);
  }
  return counts;
}

/** Which of these songs the given member has liked, as a Set for cheap `.has()` checks when rendering. */
export async function getMemberLikedSongIds(memberId: number, songIds: number[]): Promise<Set<number>> {
  if (songIds.length === 0) return new Set();
  const db = getDb();
  const rows = await db
    .select({ songId: songLikes.songId })
    .from(songLikes)
    .where(and(eq(songLikes.memberId, memberId), inArray(songLikes.songId, songIds)));
  return new Set(rows.map((r) => r.songId));
}
