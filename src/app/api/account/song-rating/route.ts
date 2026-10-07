import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { songs, drops } from "@/db/schema";
import { requireMemberSession } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { setSongRating, InvalidSongRatingError } from "@/lib/songRatings";

/** Sets the signed-in member's 1-5 rating for a song on a shipped drop (upsert) — mirrors /api/account/rating, just scoped to a song instead of a whole drop. */
export async function POST(request: Request) {
  const member = await requireMemberSession();
  if (!member) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { songId, rating } = (body ?? {}) as { songId?: number; rating?: number };
  if (!songId || !Number.isInteger(songId)) {
    return NextResponse.json({ error: "songId is required" }, { status: 400 });
  }
  if (typeof rating !== "number") {
    return NextResponse.json({ error: "rating is required" }, { status: 400 });
  }

  const club = await getDefaultClub();
  const db = getDb();
  const [song] = await db
    .select({ id: songs.id })
    .from(songs)
    .innerJoin(drops, eq(songs.dropId, drops.id))
    .where(and(eq(songs.id, songId), eq(drops.clubId, club.id), isNotNull(drops.publishedAt)))
    .limit(1);
  if (!song) {
    return NextResponse.json({ error: "That song doesn't exist" }, { status: 404 });
  }

  try {
    const result = await setSongRating(songId, member.id, rating);
    return NextResponse.json({ ok: true, rating: result.rating });
  } catch (err) {
    if (err instanceof InvalidSongRatingError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
