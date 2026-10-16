import { NextResponse } from "next/server";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";
import { createDropNote } from "@/lib/notes";

/**
 * Create path for the "about this drop" blurb feed (2026-10-16 "feed
 * of posts" redesign — founder's own ask: every Save now posts a new,
 * separately-timestamped entry instead of overwriting the same draft
 * forever; a curator can post as many as they want). Editing/deleting
 * an existing post is handled by [id]/route.ts, scoped to whoever
 * actually wrote it. Any current curator can post while a drop's open
 * — getOpenDrop only ever returns an unshipped, uncanceled drop, so
 * there's nothing to post to once it ships.
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
  const { text } = (body ?? {}) as { text?: string };
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    return NextResponse.json({ error: "Write something before posting." }, { status: 400 });
  }

  const drop = await getOpenDrop(club);
  if (!drop) {
    return NextResponse.json({ error: "No drop in progress right now." }, { status: 400 });
  }

  try {
    await createDropNote(drop.id, curator.id, trimmed);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Drop blurb post failed:", err);
    return NextResponse.json({ error: "Couldn't post that. Try again." }, { status: 500 });
  }
}
