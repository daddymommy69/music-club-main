import { NextResponse } from "next/server";
import { getCurrentCycle, sendCycleToSubscribers } from "@/lib/release";

/**
 * Manual "send now" override — lets you trigger a release outside the
 * automatic 45-day schedule. Protected by a shared secret so randoms
 * can't blast your subscriber list.
 *
 * Call it with: curl -X POST https://yoursite/api/send \
 *   -H "Authorization: Bearer <ADMIN_SECRET>"
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${process.env.ADMIN_SECRET}`;
  if (!process.env.ADMIN_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cycle = await getCurrentCycle();
  if (!cycle) {
    return NextResponse.json(
      { error: "No cycle exists yet — create one first." },
      { status: 400 }
    );
  }

  const result = await sendCycleToSubscribers(cycle);
  return NextResponse.json({ ok: true, cycle: cycle.cycleNumber, ...result });
}
