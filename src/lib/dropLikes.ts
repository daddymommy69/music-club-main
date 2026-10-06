import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { dropLikes } from "@/db/schema";
import { isUniqueViolation } from "./normalize";

/**
 * Whole-drop likes (2026-10 release-page redesign — see
 * claude/next-build.md). Separate from song_likes (src/lib/songLikes.ts):
 * this is "I liked this drop overall," shown as a count on the drop's
 * controls row. Public, same as song likes — mirrors that file's
 * toggle/race-safety pattern exactly.
 */

/** Flips the member's like on a drop. Returns the resulting liked state (not just "did a write happen"). */
export async function toggleDropLike(dropId: number, memberId: number): Promise<{ liked: boolean }> {
  const db = getDb();
  const existing = await db
    .select({ id: dropLikes.id })
    .from(dropLikes)
    .where(and(eq(dropLikes.dropId, dropId), eq(dropLikes.memberId, memberId)))
    .limit(1);

  if (existing[0]) {
    await db.delete(dropLikes).where(eq(dropLikes.id, existing[0].id));
    return { liked: false };
  }

  try {
    await db.insert(dropLikes).values({ dropId, memberId });
    return { liked: true };
  } catch (err) {
    // Lost a race with a second like click on the same drop — the
    // table's unique constraint (dropId, memberId) caught it. Either
    // way the end state is "liked", so treat it as a success rather
    // than an error, same recovery spirit as isUniqueViolation's other
    // call sites in this app.
    if (isUniqueViolation(err)) return { liked: true };
    throw err;
  }
}

/** Like counts for a batch of drops, keyed by dropId. Drops with zero likes are simply absent from the map. */
export async function getDropLikeCounts(dropIds: number[]): Promise<Map<number, number>> {
  if (dropIds.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select({ dropId: dropLikes.dropId })
    .from(dropLikes)
    .where(inArray(dropLikes.dropId, dropIds));

  const counts = new Map<number, number>();
  for (const row of rows) {
    counts.set(row.dropId, (counts.get(row.dropId) ?? 0) + 1);
  }
  return counts;
}

/** Which of these drops the given member has liked, as a Set for cheap `.has()` checks when rendering. */
export async function getMemberLikedDropIds(memberId: number, dropIds: number[]): Promise<Set<number>> {
  if (dropIds.length === 0) return new Set();
  const db = getDb();
  const rows = await db
    .select({ dropId: dropLikes.dropId })
    .from(dropLikes)
    .where(and(eq(dropLikes.memberId, memberId), inArray(dropLikes.dropId, dropIds)));
  return new Set(rows.map((r) => r.dropId));
}
