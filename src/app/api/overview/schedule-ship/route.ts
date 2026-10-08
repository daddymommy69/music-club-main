import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops } from "@/db/schema";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";

/**
 * Sets (or clears) the currently-open drop's scheduled ship date
 * (2026-10-08 "drop control" round — see claude/next-build.md). The
 * daily cron (src/app/api/cron/drops) auto-ships once this passes,
 * using the exact same logic a manual Ship click does
 * (src/lib/shipDrop.ts) — once-a-day precision, not exact-minute, per
 * the founder's own explicit "thats fine." This route only ever sets
 * the date; it never ships anything itself.
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
  const { scheduledShipAt } = (body ?? {}) as { scheduledShipAt?: string | null };

  let parsed: Date | null = null;
  if (scheduledShipAt) {
    parsed = new Date(scheduledShipAt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "That date doesn't look right." }, { status: 400 });
    }
  }

  const drop = await getOpenDrop(club);
  if (!drop) {
    return NextResponse.json({ error: "No drop in progress right now." }, { status: 400 });
  }

  const db = getDb();
  const [updated] = await db
    .update(drops)
    .set({ scheduledShipAt: parsed })
    .where(eq(drops.id, drop.id))
    .returning();

  return NextResponse.json({ ok: true, scheduledShipAt: updated.scheduledShipAt });
}
