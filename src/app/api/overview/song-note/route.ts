import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { songs } from "@/db/schema";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";
import { createSongNote } from "@/lib/notes";

/**
 * Create path for a per-song blurb feed (2026-10-16 "feed of posts"
 * redesign — same shape as drop-note/route.ts, just scoped to one
 * song). Any current curator can post as many as they want per song.
 * Scoped to a song in the currently-open drop only, checked
 * server-side — a song from any other drop 404s here. Editing/deleting
 * an existing post is handled by [id]/route.ts.
 */
export async function POST(request: Request) {
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
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    return NextResponse.json({ error: "Write something before posting." }, { status: 400 });
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
    await createSongNote(songId!, curator.id, trimmed);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Song blurb post failed:", err);
    return NextResponse.json({ error: "Couldn't post that. Try again." }, { status: 500 });
  }
}
