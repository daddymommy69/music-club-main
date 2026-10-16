import { NextResponse } from "next/server";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";
import { upsertDropNote } from "@/lib/notes";

/**
 * Write path for the "about this drop" blurb (2026-10-16 — founder's
 * own ask: an area in curator tools where anyone can write about the
 * drop, reusing curatorNotes — which already had public display built
 * for it, just no write UI until now). Any current curator can write
 * their own blurb for the currently-open drop, same scoping as rename
 * (src/app/api/overview/rename) — getOpenDrop only ever returns an
 * unshipped, uncanceled drop, so this has nothing to write to once it
 * ships. Saving blank text clears this curator's own blurb rather than
 * leaving an empty one behind (see src/lib/notes.ts's upsertDropNote).
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
  const { text } = (body ?? {}) as { text?: string };

  const drop = await getOpenDrop(club);
  if (!drop) {
    return NextResponse.json({ error: "No drop in progress right now." }, { status: 400 });
  }

  try {
    await upsertDropNote(drop.id, curator.id, text ?? "");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Drop blurb save failed:", err);
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  }
}
