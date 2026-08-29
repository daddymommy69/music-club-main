import { NextResponse } from "next/server";
import { getCurrentDrop, sendDropToSubscribers } from "@/lib/release";
import { checkBearerAuth } from "@/lib/adminAuth";

const CYCLE_DAYS = 45;

/**
 * Runs on Vercel's daily Cron schedule (see vercel.json). Vercel's free
 * tier only supports daily cron granularity, so instead of trying to
 * schedule "every 45 days" directly, this checks every day whether the
 * current drop is due and only sends when it actually is.
 *
 * Note: the design handoff's club.cycle can be weekly / biweekly /
 * monthly / every45 / quarterly / custom / manual. This route still
 * only implements the every-45-days case (Phase 0 scope); the other
 * cycle types and manual mode are Phase 1.5 (curator room) work, where
 * shipping a drop becomes an explicit curator action rather than a
 * fixed clock and the "manual" cycle simply skips the cron check.
 *
 * Vercel automatically sends `Authorization: Bearer $CRON_SECRET` when
 * invoking this route if CRON_SECRET is set as an env var — that's what
 * this checks.
 */
export async function GET(request: Request) {
  if (!checkBearerAuth(request, "CRON_SECRET")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const drop = await getCurrentDrop();
  if (!drop) {
    return NextResponse.json({ ok: true, skipped: "no drop exists yet" });
  }
  if (drop.publishedAt) {
    return NextResponse.json({ ok: true, skipped: "current drop already sent" });
  }

  const dueAt = new Date(drop.createdAt);
  dueAt.setDate(dueAt.getDate() + CYCLE_DAYS);
  if (new Date() < dueAt) {
    return NextResponse.json({
      ok: true,
      skipped: "not due yet",
      dueAt: dueAt.toISOString(),
    });
  }

  const result = await sendDropToSubscribers(drop);
  return NextResponse.json({ ok: true, drop: drop.num, ...result });
}
