import { NextResponse } from "next/server";
import { getCurrentCycle, sendCycleToSubscribers } from "@/lib/release";

const CYCLE_DAYS = 45;

/**
 * Runs on Vercel's daily Cron schedule (see vercel.json). Vercel's free
 * tier only supports daily cron granularity, so instead of trying to
 * schedule "every 45 days" directly, this checks every day whether the
 * current cycle is due and only sends when it actually is.
 *
 * Vercel automatically sends `Authorization: Bearer $CRON_SECRET` when
 * invoking this route if CRON_SECRET is set as an env var — that's what
 * this checks.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cycle = await getCurrentCycle();
  if (!cycle) {
    return NextResponse.json({ ok: true, skipped: "no cycle exists yet" });
  }
  if (cycle.sentAt) {
    return NextResponse.json({ ok: true, skipped: "current cycle already sent" });
  }

  const dueAt = new Date(cycle.startDate);
  dueAt.setDate(dueAt.getDate() + CYCLE_DAYS);
  if (new Date() < dueAt) {
    return NextResponse.json({
      ok: true,
      skipped: "not due yet",
      dueAt: dueAt.toISOString(),
    });
  }

  const result = await sendCycleToSubscribers(cycle);
  return NextResponse.json({ ok: true, cycle: cycle.cycleNumber, ...result });
}
