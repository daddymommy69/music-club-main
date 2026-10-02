import { NextResponse } from "next/server";
import { asc, and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops, songs } from "@/db/schema";
import { getDefaultClub } from "@/lib/club";
import { checkBearerAuth } from "@/lib/adminAuth";
import { buildSpotifyPlaylistForDrop } from "@/lib/spotifyBuild";

/**
 * One-off: attach an auto-built Spotify playlist to a drop that already
 * shipped without one (built 2026-10 to backfill drop #1 as a real-world
 * test of the auto-build path — see plan.md). Deliberately does NOT call
 * sendDropToSubscribers — this only sets drops.spotifyUrl, it never
 * re-sends the release message, since the drop already went out.
 * Protected the same way as /api/drops (ADMIN_SECRET), since this isn't
 * a curator-facing action.
 *
 * curl -X POST https://yoursite/api/admin/spotify-backfill \
 *   -H "Authorization: Bearer <ADMIN_SECRET>" \
 *   -H "Content-Type: application/json" \
 *   -d '{"dropNum": 1}'
 */
export async function POST(request: Request) {
  if (!checkBearerAuth(request, "ADMIN_SECRET")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { dropNum } = body as { dropNum?: number };
  if (!Number.isInteger(dropNum)) {
    return NextResponse.json({ error: "dropNum (integer) required" }, { status: 400 });
  }

  const club = await getDefaultClub();
  const db = getDb();

  const [drop] = await db
    .select()
    .from(drops)
    .where(and(eq(drops.clubId, club.id), eq(drops.num, dropNum!)))
    .limit(1);
  if (!drop) {
    return NextResponse.json({ error: `No drop #${dropNum} in this club.` }, { status: 404 });
  }

  const dropSongs = await db
    .select()
    .from(songs)
    .where(eq(songs.dropId, drop.id))
    .orderBy(asc(songs.position), asc(songs.createdAt));

  const result = await buildSpotifyPlaylistForDrop(club, drop.num, dropSongs);
  if (!result) {
    return NextResponse.json(
      {
        error:
          "Auto-build didn't produce a playlist — check that Spotify is connected (see /settings) and that SPOTIFY_CLIENT_ID/SECRET are set.",
      },
      { status: 400 }
    );
  }

  await db.update(drops).set({ spotifyUrl: result.url }).where(eq(drops.id, drop.id));

  return NextResponse.json({
    ok: true,
    dropNum: drop.num,
    spotifyUrl: result.url,
    matchedCount: result.matchedCount,
    totalCount: result.totalCount,
    unmatchedTitles: result.unmatchedTitles,
  });
}
