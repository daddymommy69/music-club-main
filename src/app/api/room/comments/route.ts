import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { comments } from "@/db/schema";
import { getSessionCuratorId } from "@/lib/curatorSession";
import { getCuratorById } from "@/lib/curators";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";

/** Posts a comment to the currently-open drop's curator-only thread. */
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
  const text = (body as { text?: string } | null)?.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "Comment can't be empty" }, { status: 400 });
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
  const [created] = await db
    .insert(comments)
    .values({ clubId: club.id, dropNum: drop.num, curatorId: curator.id, text })
    .returning();

  return NextResponse.json({
    ok: true,
    comment: { ...created, curatorName: curator.name },
  });
}
