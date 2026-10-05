import { and, eq, inArray, sql, count } from "drizzle-orm";
import { getDb } from "@/db/client";
import { dropRatings, type DropRating } from "@/db/schema";

/**
 * Drop ratings (2026-10 "next build" decision — see
 * claude/next-build.md). One 1-5 rating per member per drop, upsertable
 * — enforced by the table's own unique constraint on (dropId, memberId)
 * so this can be a plain select-then-write with no race-prone
 * check-then-act gap wider than a single extra query. 1-5 is enforced
 * here at the application layer (the schema comment calls out that a
 * Postgres CHECK constraint would also be fine, but every other
 * range-like rule in this app — e.g. favorites' max-5 — is app-layer
 * only, so this matches that convention).
 */

export class InvalidRatingError extends Error {}

function assertValidRating(rating: number): void {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new InvalidRatingError("Rating must be a whole number from 1 to 5.");
  }
}

export async function setDropRating(dropId: number, memberId: number, rating: number): Promise<DropRating> {
  assertValidRating(rating);
  const db = getDb();

  const [existing] = await db
    .select({ id: dropRatings.id })
    .from(dropRatings)
    .where(and(eq(dropRatings.dropId, dropId), eq(dropRatings.memberId, memberId)))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(dropRatings)
      .set({ rating, updatedAt: new Date() })
      .where(eq(dropRatings.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(dropRatings).values({ dropId, memberId, rating }).returning();
  return created;
}

/** The member's own rating for a drop, or null if they haven't rated it. */
export async function getMemberDropRating(dropId: number, memberId: number): Promise<number | null> {
  const db = getDb();
  const [row] = await db
    .select({ rating: dropRatings.rating })
    .from(dropRatings)
    .where(and(eq(dropRatings.dropId, dropId), eq(dropRatings.memberId, memberId)))
    .limit(1);
  return row?.rating ?? null;
}

/** The member's own ratings across several drops at once (for the account page's "your ratings" list), keyed by dropId. */
export async function getMemberDropRatings(memberId: number, dropIds: number[]): Promise<Map<number, number>> {
  if (dropIds.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select({ dropId: dropRatings.dropId, rating: dropRatings.rating })
    .from(dropRatings)
    .where(and(eq(dropRatings.memberId, memberId), inArray(dropRatings.dropId, dropIds)));
  return new Map(rows.map((r) => [r.dropId, r.rating]));
}

export type DropRatingSummary = { average: number | null; count: number };

/** Public average + count for a drop. average is null when nobody's rated it yet — the release page hides the line entirely in that case rather than showing "0". */
export async function getDropRatingSummary(dropId: number): Promise<DropRatingSummary> {
  const db = getDb();
  const [row] = await db
    .select({
      average: sql<string | null>`avg(${dropRatings.rating})`,
      count: count(),
    })
    .from(dropRatings)
    .where(eq(dropRatings.dropId, dropId));

  const average = row?.average != null ? Number(row.average) : null;
  return { average, count: row?.count ?? 0 };
}
