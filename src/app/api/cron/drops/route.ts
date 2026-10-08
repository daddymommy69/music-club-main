import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { clubs, drops } from "@/db/schema";
import { checkBearerAuth } from "@/lib/adminAuth";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";
import { shipDrop } from "@/lib/shipDrop";

/**
 * Runs on Vercel's daily Cron schedule (see vercel.json). Replaces the
 * old /api/cron/send (2026-10-08 "drop control" round — see
 * claude/next-build.md): that route's own comment had already flagged
 * it as stale the moment shipping became an explicit curator action
 * rather than a fixed 45-day clock, and this is that promised
 * replacement — now that curators can actually schedule things, there's
 * real work for a daily check to do again.
 *
 * Two independent checks, same "once-a-day precision, not exact-
 * minute" limit the founder explicitly signed off on (Vercel's free
 * tier only supports daily cron granularity):
 *
 *   1. Auto-open: if nothing's currently open and the club has a
 *      nextDropOpensAt that's passed, start the next drop — same
 *      insert /api/overview/start-drop does, just actor = "Auto-open."
 *   2. Auto-ship: if there IS an open drop and its own scheduledShipAt
 *      has passed, ship it — the exact same src/lib/shipDrop.ts logic
 *      a curator's manual Ship click runs, actor = "Auto-ship."
 *
 * Both are independent and best-effort: either, both, or neither can
 * fire on a given day depending on what's scheduled.
 */
export async function GET(request: Request) {
  if (!checkBearerAuth(request, "CRON_SECRET")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const club = await getDefaultClub();
  const db = getDb();
  const now = new Date();

  let opened: { dropNum: number } | null = null;
  let openError: string | null = null;
  let shipped: Awaited<ReturnType<typeof shipDrop>> | null = null;
  let shipError: string | null = null;

  // Nobody's watching this cron's log day to day, so it needs to tell
  // its own story in the response instead of throwing a raw 500
  // (2026-10-08 audit fix — see claude/next-build.md). Each step gets
  // its own try/catch — a DB hiccup or a lost race on the new drop's
  // number (see /api/overview/start-drop's own race guard) now shows
  // up as `openError`/`shipError` in the response rather than crashing
  // the whole invocation before the other step even runs.
  let openDrop: Awaited<ReturnType<typeof getOpenDrop>> = null;
  try {
    openDrop = await getOpenDrop(club);

    if (!openDrop && club.nextDropOpensAt && club.nextDropOpensAt <= now) {
      const [last] = await db
        .select()
        .from(drops)
        .where(eq(drops.clubId, club.id))
        .orderBy(desc(drops.num))
        .limit(1);

      const [created] = await db
        .insert(drops)
        .values({
          clubId: club.id,
          num: (last?.num ?? 0) + 1,
          startedBy: "Auto-open",
        })
        .returning();

      await db.update(clubs).set({ nextDropOpensAt: null }).where(eq(clubs.id, club.id));
      opened = { dropNum: created.num };
    }
  } catch (err) {
    console.error("[cron/drops] auto-open step failed:", err);
    openError = err instanceof Error ? err.message : String(err);
  }

  try {
    if (openDrop && openDrop.scheduledShipAt && openDrop.scheduledShipAt <= now) {
      shipped = await shipDrop(club, openDrop, { shippedBy: "Auto-ship" });
    }
  } catch (err) {
    console.error("[cron/drops] auto-ship step failed:", err);
    shipError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({ ok: true, opened, openError, shipped, shipError });
}
