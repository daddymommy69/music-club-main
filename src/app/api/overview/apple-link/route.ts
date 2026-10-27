import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops } from "@/db/schema";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { isValidMusicLink } from "@/lib/musicLink";

/**
 * Set/update/clear a shipped drop's Apple Music link (2026-10-27 round
 * — founder's own ask: ship-time's own appleUrl field was one-shot, no
 * way back in once a drop had already shipped. "Drop options" in the
 * curator More tab is the new entry point — see MoreSection /
 * CuratorToolsPanel.tsx — always re-editable, not a separate one-time
 * thing. Same curator-session + club-match gate as every other
 * curator-only mutation here (/api/overview/build-playlist is the
 * closest sibling — same shape, different field). An empty string
 * clears the link back to unset, same as leaving it blank at ship
 * time.
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

  const body = await request.json().catch(() => null);
  const parsed = body as { dropNum?: number; appleUrl?: string } | null;
  const dropNum = parsed?.dropNum;
  if (!Number.isInteger(dropNum)) {
    return NextResponse.json({ error: "dropNum (integer) required" }, { status: 400 });
  }

  const appleUrl = parsed?.appleUrl?.trim() || null;
  if (appleUrl && !isValidMusicLink(appleUrl)) {
    return NextResponse.json({ error: "That Apple Music link doesn't look right" }, { status: 400 });
  }

  const db = getDb();
  const [drop] = await db
    .select()
    .from(drops)
    .where(and(eq(drops.clubId, club.id), eq(drops.num, dropNum!)))
    .limit(1);

  if (!drop || !drop.publishedAt) {
    return NextResponse.json({ error: `No shipped drop #${dropNum} here.` }, { status: 404 });
  }

  await db.update(drops).set({ appleUrl }).where(eq(drops.id, drop.id));

  return NextResponse.json({ ok: true, appleUrl });
}
