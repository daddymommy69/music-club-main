import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { cycles } from "@/db/schema";

/**
 * Minimal way to start a new cycle before the real curator page (Phase
 * 1.5) exists. Protected by the same admin secret as /api/send.
 *
 * curl -X POST https://yoursite/api/cycles \
 *   -H "Authorization: Bearer <ADMIN_SECRET>" \
 *   -H "Content-Type: application/json" \
 *   -d '{"appleMusicUrl": "https://music.apple.com/...", "writeUp": "optional note"}'
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${process.env.ADMIN_SECRET}`;
  if (!process.env.ADMIN_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { appleMusicUrl, spotifyUrl, writeUp } = body as {
    appleMusicUrl?: string;
    spotifyUrl?: string;
    writeUp?: string;
  };

  const db = getDb();
  const [last] = await db
    .select()
    .from(cycles)
    .orderBy(desc(cycles.cycleNumber))
    .limit(1);

  const [created] = await db
    .insert(cycles)
    .values({
      cycleNumber: (last?.cycleNumber ?? 0) + 1,
      startDate: new Date(),
      appleMusicUrl: appleMusicUrl ?? null,
      spotifyUrl: spotifyUrl ?? null,
      writeUp: writeUp ?? null,
    })
    .returning();

  return NextResponse.json({ ok: true, cycle: created });
}
