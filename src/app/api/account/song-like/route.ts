import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { songs } from "@/db/schema";
import { requireMemberSession } from "@/lib/memberSession";
import { toggleSongLike } from "@/lib/songLikes";

/** Toggles the signed-in member's like on any song, on any drop (past or current) — see claude/next-build.md. */
export async function POST(request: Request) {
  const member = await requireMemberSession();
  if (!member) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const songId = (body as { songId?: number } | null)?.songId;
  if (!songId || !Number.isInteger(songId)) {
    return NextResponse.json({ error: "songId is required" }, { status: 400 });
  }

  const db = getDb();
  const [song] = await db.select({ id: songs.id }).from(songs).where(eq(songs.id, songId)).limit(1);
  if (!song) {
    return NextResponse.json({ error: "That song doesn't exist" }, { status: 404 });
  }

  const result = await toggleSongLike(songId, member.id);
  return NextResponse.json(result);
}
