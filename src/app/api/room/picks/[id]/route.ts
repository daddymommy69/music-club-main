import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { songs } from "@/db/schema";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";

/**
 * Removes a curator pick from the currently-open drop (2026-10-08
 * curator tools redesign — see claude/next-build.md: "This cycle's
 * picks" grew a Remove action, which didn't exist anywhere before).
 * Any curator can remove any curator-type pick while the room's still
 * open — same collaborative-pile spirit as Quick-add already letting
 * any curator pull in any submission, not a per-curator-owns-their-
 * picks model. Scoped to pickType = 'curator' and to the open drop
 * specifically — a Listener Pick has its own withdraw path
 * (/api/account/listener-pick), and a shipped drop's tracklist is
 * permanent history, not something this endpoint can touch.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const curator = await getSessionMember();
  if (!curator || !curator.isCurator) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid pick" }, { status: 400 });
  }

  const club = await getDefaultClub();
  if (curator.clubId !== club.id) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const drop = await getOpenDrop(club);
  if (!drop) {
    return NextResponse.json({ error: "No drop in progress right now." }, { status: 400 });
  }

  const db = getDb();
  const deleted = await db
    .delete(songs)
    .where(and(eq(songs.id, id), eq(songs.dropId, drop.id), eq(songs.pickType, "curator")))
    .returning({ id: songs.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: "That pick isn't here anymore." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
