import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { songs } from "@/db/schema";
import { getSessionCuratorId } from "@/lib/curatorSession";
import { getCuratorById } from "@/lib/curators";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";
import { isValidMusicLink } from "@/lib/musicLink";
import { resolveSongMetadata } from "@/lib/odesli";
import { findDuplicateInDrop } from "@/lib/duplicateCheck";

/** Add-a-pick: a curator pastes a link straight into the room, attributed to them. */
export async function POST(request: Request) {
  const curatorId = await getSessionCuratorId();
  if (!curatorId) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const curator = await getCuratorById(curatorId);
  if (!curator) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = body as { link?: string; force?: boolean } | null;
  const link = parsed?.link?.trim();
  const force = !!parsed?.force;
  if (!link || !isValidMusicLink(link)) {
    return NextResponse.json(
      { error: "That link doesn't look right — try pasting it again." },
      { status: 400 }
    );
  }

  const club = await getDefaultClub();
  if (curator.clubId !== club.id) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const drop = await getOpenDrop(club);
  if (!drop) {
    return NextResponse.json({ error: "No drop in progress right now." }, { status: 400 });
  }

  // Best-effort but not optional here — unlike the public submit form,
  // songs.title/artist are NOT NULL, so a pick needs resolved metadata
  // to exist at all. (Untested in this sandbox: egress to api.song.link
  // is blocked here, same known limitation as /api/submit's lookup.)
  const metadata = await resolveSongMetadata(link);
  if (!metadata) {
    return NextResponse.json(
      { error: "Couldn't read that link — try again in a moment." },
      { status: 502 }
    );
  }

  // Already submitted or already picked for this drop? Warn, don't
  // block — a second curator might genuinely want to co-sign the pick.
  if (!force) {
    const duplicate = await findDuplicateInDrop({
      clubId: club.id,
      dropNum: drop.num,
      dropId: drop.id,
      link,
      title: metadata.title,
      artist: metadata.artist,
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
      title: metadata.title,
      artist: metadata.artist,
      artworkUrl: metadata.artworkUrl,
      sourceUrl: link,
      submittedBy: null,
      curatorCredit: curator.name,
      curatorId: curator.id,
    })
    .returning();

  return NextResponse.json({ ok: true, song: created });
}
