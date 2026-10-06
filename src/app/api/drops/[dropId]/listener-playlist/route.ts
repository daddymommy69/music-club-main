import { NextResponse } from "next/server";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops, songs } from "@/db/schema";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { buildListenerPickPlaylist } from "@/lib/listenerPlaylist";

/**
 * Curator-only, on-demand build of a published drop's Listener Pick
 * playlist (2026-10 release-page redesign — see claude/next-build.md).
 * Deliberately a separate endpoint from /api/overview/ship: that one
 * only ever runs once, automatically, when a drop ships — this one can
 * be clicked any time after, from the new /drop/[num]/listener-picks
 * page, same "manual override always wins, auto-build failure is
 * silent" spirit as ship's own Spotify step, just without a manual-
 * link fallback since there's nothing to paste here.
 */
export async function POST(request: Request, { params }: { params: Promise<{ dropId: string }> }) {
  const curator = await getSessionMember();
  if (!curator || !curator.isCurator) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { dropId: dropIdParam } = await params;
  const dropId = Number(dropIdParam);
  if (!Number.isInteger(dropId)) {
    return NextResponse.json({ error: "Invalid drop" }, { status: 400 });
  }

  const club = await getDefaultClub();
  if (curator.clubId !== club.id) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const db = getDb();
  const [drop] = await db
    .select()
    .from(drops)
    .where(and(eq(drops.id, dropId), eq(drops.clubId, club.id), isNotNull(drops.publishedAt)))
    .limit(1);
  if (!drop) {
    return NextResponse.json({ error: "That drop doesn't exist" }, { status: 404 });
  }

  const listenerSongs = await db
    .select()
    .from(songs)
    .where(and(eq(songs.dropId, drop.id), eq(songs.pickType, "listener")))
    .orderBy(asc(songs.position), asc(songs.createdAt));

  if (listenerSongs.length === 0) {
    return NextResponse.json({ error: "This drop has no Listener Picks yet" }, { status: 400 });
  }

  const build = await buildListenerPickPlaylist(club, drop.id, drop.num, listenerSongs);
  if (!build) {
    return NextResponse.json(
      { error: "Couldn't build the playlist — Spotify may not be connected right now." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, ...build });
}
