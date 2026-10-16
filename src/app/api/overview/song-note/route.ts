import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { songs } from "@/db/schema";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";
import { upsertSongNote } from "@/lib/notes";

/**
 * Write path for a per-song blurb (2026-10-16 — founder's own ask:
 * "we can write a blurb about each song... anyone can write about each
 * song," any current curator, more than one blurb per song since each
 * curator keeps their own row — same pattern as the drop-level blurb's
 * /api/overview/drop-note). Scoped to a song in the currently-open
 * drop only, checked server-side (not just by what the UI exposes) —
 * a song from any other drop 404s here. Saving blank text clears this
 * curator's own blurb rather than leaving an empty one behind (see
 * src/lib/notes.ts's upsertSongNote).
 */
export async function PUT(request: Request) {
  const curator = await getSessionMember();
  if (!curator || !curator.isCurator) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const club = await getDefaultClub();
  if (curator.clubId !== club.id) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { songId, text } = (body ?? {}) as { songId?: number; text?: string };
  if (!Number.isInteger(songId)) {
    return NextResponse.json({ error: "songId (integer) required" }, { status: 400 });
  }

  const drop = await getOpenDrop(club);
  if (!drop) {
    return NextResponse.json({ error: "No drop in progress right now." }, { status: 400 });
  }

  const db = getDb();
  const [song] = await db.select().from(songs).where(eq(songs.id, songId!)).limit(1);
  if (!song || song.dropId !== drop.id) {
    return NextResponse.json({ error: "That song isn't part of the open drop." }, { status: 404 });
  }

  try {
    await upsertSongNote(songId!, curator.id, text ?? "");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Song blurb save failed:", err);
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  }
}
