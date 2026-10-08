import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { songs } from "@/db/schema";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";
import { findDuplicateInDrop } from "@/lib/duplicateCheck";

type Body = {
  spotifyId?: string;
  title?: string;
  artist?: string;
  artworkUrl?: string | null;
  externalUrl?: string | null;
  force?: boolean;
};

/**
 * Add-a-pick via Spotify search-and-select (2026-10-08 curator tools
 * redesign — see claude/next-build.md), the new primary way to add a
 * curator pick — replacing the old paste-a-link flow
 * (src/app/api/room/picks/route.ts, kept exactly as it was and used as
 * the client-side fallback whenever this club's Spotify connection
 * isn't available; see CuratorToolsPanel.tsx's AddPick/ManualAddPick).
 *
 * The whole point of this path is that title/artist/artwork come
 * straight from the search result the curator clicked, not from a
 * second lookup after the fact — so unlike the old route, nothing here
 * depends on Odesli (dead since 2026-07-31) and there's no 502 case.
 * Also the first curator-facing write to songs.spotifyUri — previously
 * only the ship-time auto-build step ever set it.
 */
export async function POST(request: Request) {
  const curator = await getSessionMember();
  if (!curator || !curator.isCurator) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const spotifyId = body?.spotifyId?.trim();
  const title = body?.title?.trim();
  const artist = body?.artist?.trim();
  if (!spotifyId || !title || !artist) {
    return NextResponse.json(
      { error: "That didn't come through right — try searching again." },
      { status: 400 }
    );
  }
  const force = !!body?.force;
  const artworkUrl = body?.artworkUrl ?? null;
  const externalUrl = body?.externalUrl ?? null;
  const uri = `spotify:track:${spotifyId}`;

  const club = await getDefaultClub();
  if (curator.clubId !== club.id) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const drop = await getOpenDrop(club);
  if (!drop) {
    return NextResponse.json({ error: "No drop in progress right now." }, { status: 400 });
  }

  // Same "warn, don't block" duplicate behavior as the paste-a-link
  // route — a second curator might genuinely want to co-sign the pick.
  if (!force) {
    const duplicate = await findDuplicateInDrop({
      clubId: club.id,
      dropNum: drop.num,
      dropId: drop.id,
      link: externalUrl ?? uri,
      title,
      artist,
    });
    if (duplicate) {
      return NextResponse.json({
        duplicate: true,
        existing: { title: duplicate.title, artist: duplicate.artist },
      });
    }
  }

  const db = getDb();
  const [created] = await db
    .insert(songs)
    .values({
      dropId: drop.id,
      title,
      artist,
      artworkUrl,
      sourceUrl: externalUrl,
      spotifyUri: uri,
      submittedBy: null,
      curatorCredit: curator.name,
      curatorId: curator.id,
    })
    .returning();

  return NextResponse.json({ ok: true, song: created });
}
