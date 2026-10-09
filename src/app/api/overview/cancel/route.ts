import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
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

  try {
    const db = getDb();
    // Claim the cancel atomically, the same way sendDropToSubscribers
    // claims a ship (2026-10-09 audit fix — see claude/next-build.md):
    // only cancel if the drop hasn't been published in the meantime.
    // Without this guard, a Cancel click landing in the same instant as
    // a Ship (manual or the daily cron) could succeed on a drop that
    // just shipped, leaving it marked both shipped AND canceled at
    // once — release.ts's own claim gained the mirror-image guard
    // (isNull(canceledAt)) in this same round, so neither side can win
    // against an already-finished other side.
    const claimed = await db
      .update(drops)
      .set({ canceledAt: new Date(), canceledBy: curator.name || "A curator" })
      .where(and(eq(drops.id, drop.id), isNull(drops.publishedAt)))
      .returning();

    if (!claimed[0]) {
      return NextResponse.json({ error: "This drop just shipped — nothing to cancel." }, { status: 409 });
    }

    return NextResponse.json({ ok: true, dropNum: drop.num });
  } catch (err) {
    console.error("Drop cancel failed:", err);
    return NextResponse.json({ error: "Couldn't cancel that. Try again." }, { status: 500 });
  }
}
