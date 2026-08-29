import { NextResponse } from "next/server";
import { getCurrentDrop, sendDropToSubscribers } from "@/lib/release";
import { checkBearerAuth } from "@/lib/adminAuth";

/**
 * Manual "send now" override — lets you trigger a release outside the
 * automatic cycle schedule. Protected by a shared secret so randoms
 * can't blast your subscriber list.
 *
 * Call it with: curl -X POST https://yoursite/api/send \
 *   -H "Authorization: Bearer <ADMIN_SECRET>"
 */
export async function POST(request: Request) {
  if (!checkBearerAuth(request, "ADMIN_SECRET")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const drop = await getCurrentDrop();
  if (!drop) {
    return NextResponse.json(
      { error: "No drop exists yet — create one first." },
      { status: 400 }
    );
  }

  const result = await sendDropToSubscribers(drop);
  return NextResponse.json({ ok: true, drop: drop.num, ...result });
}
