import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { curatorNotes } from "@/db/schema";
import { getSessionCuratorId } from "@/lib/curatorSession";
import { getCuratorById } from "@/lib/curators";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";

/** Upserts the logged-in curator's note for the currently-open drop. */
export async function PUT(request: Request) {
  const curatorId = await getSessionCuratorId();
  if (!curatorId) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const curator = await getCuratorById(curatorId);
  if (!curator) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const text = (body as { text?: string } | null)?.text ?? "";

  const club = await getDefaultClub();
  if (curator.clubId !== club.id) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const drop = await getOpenDrop(club);
  if (!drop) {
    return NextResponse.json({ error: "No drop in progress right now." }, { status: 400 });
  }

  const db = getDb();
  const existing = await db
    .select({ id: curatorNotes.id })
    .from(curatorNotes)
    .where(and(eq(curatorNotes.dropId, drop.id), eq(curatorNotes.curatorId, curator.id)))
    .limit(1);

  if (existing[0]) {
    await db
      .update(curatorNotes)
      .set({ text, updatedAt: new Date() })
      .where(eq(curatorNotes.id, existing[0].id));
  } else {
    await db.insert(curatorNotes).values({ dropId: drop.id, curatorId: curator.id, text });
  }

  return NextResponse.json({ ok: true });
}
