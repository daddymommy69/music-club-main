import { and, eq, inArray, sql, count } from "drizzle-orm";
import { getDb } from "@/db/client";
import { songRatings, type SongRating } from "@/db/schema";

/**
 * Per-song ratings (2026-10-07 "Browse" round — see claude/next-build.md):
 * the founder wanted a song's own 1-5 rating to show "everywhere" a song
 * appears (track rows, Browse), not just the whole-drop rating. One
 * rating per member per song, upsertable — same shape and the same
 * select-then-write pattern as src/lib/ratings.ts (dropRatings), backed
 * by songRatings' own (songId, memberId) unique constraint so this never
 * needs a race-prone check-then-act gap wider than one extra query.
 */

export class InvalidSongRatingError extends Error {}

function assertValidRating(rating: number): void {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new InvalidSongRatingError("Rating must be a whole number from 1 to 5.");
  }
}

export async function setSongRating(songId: number, memberId: number, rating: number): Promise<SongRating> {
  assertValidRating(rating);
  const db = getDb();

  const [existing] = await db
    .select({ id: songRatings.id })
    .from(songRatings)
    .where(and(eq(songRatings.songId, songId), eq(songRatings.memberId, memberId)))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(songRatings)
      .set({ rating, updatedAt: new Date() })
      .where(eq(songRatings.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(songRatings).values({ songId, memberId, rating }).returning();
  return created;
}

/** The member's own rating for a song, or null if they haven't rated it. */
export async function getMemberSongRating(songId: number, memberId: number): Promise<number | null> {
  const db = getDb();
  const [row] = await db
    .select({ rating: songRatings.rating })
    .from(songRatings)
    .where(and(eq(songRatings.songId, songId), eq(songRatings.memberId, memberId)))
    .limit(1);
  return row?.rating ?? null;
}

/** The member's own ratings across several songs at once, keyed by songId — for a track list that needs every row's rating in one query. */
export async function getMemberSongRatings(memberId: number, songIds: number[]): Promise<Map<number, number>> {
  if (songIds.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select({ songId: songRatings.songId, rating: songRatings.rating })
    .from(songRatings)
    .where(and(eq(songRatings.memberId, memberId), inArray(songRatings.songId, songIds)));
  return new Map(rows.map((r) => [r.songId, r.rating]));
}

export type SongRatingSummary = { average: number | null; count: number };

/** Public average + count for one song. average is null when nobody's rated it yet — callers hide the number in that case rather than showing "0". */
export async function getSongRatingSummary(songId: number): Promise<SongRatingSummary> {
  const db = getDb();
  const [row] = await db
    .select({
      average: sql<string | null>`avg(${songRatings.rating})`,
      count: count(),
    })
    .from(songRatings)
    .where(eq(songRatings.songId, songId));

  const average = row?.average != null ? Number(row.average) : null;
  return { average, count: row?.count ?? 0 };
}

/** Public average + count for several songs at once, keyed by songId — avoids one query per row on a track list or Browse grid. */
export async function getSongRatingSummaries(songIds: number[]): Promise<Map<number, SongRatingSummary>> {
  if (songIds.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select({
      songId: songRatings.songId,
      average: sql<string | null>`avg(${songRatings.rating})`,
      count: count(),
    })
    .from(songRatings)
    .where(inArray(songRatings.songId, songIds))
    .groupBy(songRatings.songId);

  return new Map(
    rows.map((r) => [r.songId, { average: r.average != null ? Number(r.average) : null, count: r.count }])
  );
}
