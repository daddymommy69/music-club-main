import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { memberFavorites, type MemberFavorite } from "@/db/schema";

/**
 * Favorite-drops showcase (2026-10 "next build" decision — see
 * claude/next-build.md): up to 5 of a member's own past shipped drops,
 * ordered. Replace-all-on-save — delete the member's existing rows and
 * insert the new ordered set, in one transaction — is simpler than
 * diffing a reorder and the table is tiny per member, so the cost is
 * negligible. Caller (the API route) is responsible for only offering
 * shipped drops to pick from; this function trusts the dropIds it's
 * given, same pattern as every other write helper in this app.
 */

export const MAX_FAVORITES = 5;

export class InvalidFavoritesError extends Error {}

export async function getMemberFavorites(memberId: number): Promise<MemberFavorite[]> {
  const db = getDb();
  return db
    .select()
    .from(memberFavorites)
    .where(eq(memberFavorites.memberId, memberId))
    .orderBy(asc(memberFavorites.position));
}

/** dropIds is the member's new favorites list, in the order they should display — position is derived from array order, 1-based. */
export async function setMemberFavorites(memberId: number, dropIds: number[]): Promise<MemberFavorite[]> {
  if (dropIds.length > MAX_FAVORITES) {
    throw new InvalidFavoritesError(`At most ${MAX_FAVORITES} favorite drops.`);
  }
  if (new Set(dropIds).size !== dropIds.length) {
    throw new InvalidFavoritesError("Can't pick the same drop twice.");
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.delete(memberFavorites).where(eq(memberFavorites.memberId, memberId));
    if (dropIds.length === 0) return [];
    return tx
      .insert(memberFavorites)
      .values(dropIds.map((dropId, i) => ({ memberId, dropId, position: i + 1 })))
      .returning();
  });
}
