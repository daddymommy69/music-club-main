import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { dropSaves } from "@/db/schema";
import { isUniqueViolation } from "./normalize";

/**
 * Whole-drop saves (2026-10 release-page redesign — see
 * claude/next-build.md). A private bookmark, distinct from the public
 * drop_likes count in src/lib/dropLikes.ts, and distinct from the
 * drop's "Open playlist on Spotify ↗" link-out — there's no visitor-side
 * Spotify OAuth, so this never touches a member's real Spotify library.
 * Mirrors songLikes.ts's toggle/race-safety pattern exactly.
 */

/** Flips the member's save on a drop. Returns the resulting saved state (not just "did a write happen"). */
export async function toggleDropSave(dropId: number, memberId: number): Promise<{ saved: boolean }> {
  const db = getDb();
  const existing = await db
    .select({ id: dropSaves.id })
    .from(dropSaves)
    .where(and(eq(dropSaves.dropId, dropId), eq(dropSaves.memberId, memberId)))
    .limit(1);

  if (existing[0]) {
    await db.delete(dropSaves).where(eq(dropSaves.id, existing[0].id));
    return { saved: false };
  }

  try {
    await db.insert(dropSaves).values({ dropId, memberId });
    return { saved: true };
  } catch (err) {
    // Lost a race with a second save click on the same drop — the
    // table's unique constraint (dropId, memberId) caught it. Either
    // way the end state is "saved", so treat it as a success rather
    // than an error, same recovery spirit as isUniqueViolation's other
    // call sites in this app.
    if (isUniqueViolation(err)) return { saved: true };
    throw err;
  }
}

/** Which of these drops the given member has saved, as a Set for cheap `.has()` checks when rendering. */
export async function getMemberSavedDropIds(memberId: number, dropIds: number[]): Promise<Set<number>> {
  if (dropIds.length === 0) return new Set();
  const db = getDb();
  const rows = await db
    .select({ dropId: dropSaves.dropId })
    .from(dropSaves)
    .where(and(eq(dropSaves.memberId, memberId), inArray(dropSaves.dropId, dropIds)));
  return new Set(rows.map((r) => r.dropId));
}
