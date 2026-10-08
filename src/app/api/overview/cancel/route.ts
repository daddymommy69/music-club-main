import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops } from "@/db/schema";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";

/**
 * Cancels the currently-open drop (2026-10-08 "drop control" round —
 * see claude/next-build.md) — the founder's own explicit ask: close it
 * off without losing anything. Nothing is deleted here: the drop row
 * and every song/pick on it stay exactly as they were, just no longer
 * treated as "open" anywhere (getCurrentDrop filters out any row with
 * canceledAt set) — so curators can start a fresh drop right after,
 * and canceledAt/canceledBy become the "closed off for curators' eyes
 * only" signal the founder asked for (see /api/overview/uncancel for
 * reversing this, and the client for why its visibility stays
 * curator-only: the public archive/drop-detail queries only ever
 * select publishedAt IS NOT NULL rows, and a canceled drop never gets
 * published, so it was already invisible to the public before this
 * route even existed).
 */
export async function POST() {
  const curator = await getSessionMember();
  if (!curator || !curator.isCurator) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
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
  await db
    .update(drops)
    .set({ canceledAt: new Date(), canceledBy: curator.name || "A curator" })
    .where(eq(drops.id, drop.id));

  return NextResponse.json({ ok: true, dropNum: drop.num });
}
