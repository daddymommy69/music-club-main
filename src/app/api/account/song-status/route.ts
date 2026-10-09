import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { songs } from "@/db/schema";
import { getSessionMember } from "@/lib/memberSession";
import { getLikeCounts, getMemberLikedSongIds } from "@/lib/songLikes";
import { getSongRatingSummary, getMemberSongRating } from "@/lib/songRatings";

/**
 * The floating bottom player's own like + rating controls (2026-10-08
 * player revamp — see claude/next-build.md) fetch this fresh for
 * whatever's current, rather than relying on initial values threaded
 * through from wherever the track was clicked — the bar is global and
 * a track can become "current" via next/back/natural-advance with no
 * rendered row nearby to have handed it anything. Works logged out
 * (liked: false, rating: null) same as every other like/rating read
 * on the site — the public count/average still shows either way.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const songId = Number(searchParams.get("songId"));
  if (!Number.isInteger(songId) || songId <= 0) {
    return NextResponse.json({ error: "songId is required" }, { status: 400 });
  }

  const db = getDb();
  const [song] = await db.select({ id: songs.id }).from(songs).where(eq(songs.id, songId)).limit(1);
  if (!song) {
    return NextResponse.json({ error: "That song doesn't exist" }, { status: 404 });
  }

  const member = await getSessionMember();

  const [likeCounts, ratingSummary, likedSet, myRating] = await Promise.all([
    getLikeCounts([songId]),
    getSongRatingSummary(songId),
    member ? getMemberLikedSongIds(member.id, [songId]) : Promise.resolve(new Set<number>()),
    member ? getMemberSongRating(songId, member.id) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    liked: likedSet.has(songId),
    likeCount: likeCounts.get(songId) ?? 0,
    rating: myRating,
    ratingAverage: ratingSummary.average,
    ratingCount: ratingSummary.count,
  });
}
