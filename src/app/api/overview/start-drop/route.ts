import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops } from "@/db/schema";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";

/**
 * Curator-session-gated "start the next drop" (2026-10-06 QA sweep —
 * see claude/next-build.md). Before this, the ONLY way to start a new
 * drop was curling POST /api/drops with the admin secret from a
 * terminal — so the moment a drop shipped, /submit and /overview's
 * quick-add both went dark (both require an actual open `drops` row,
 * via getOpenDrop) until someone remembered to run that command by
 * hand outside the app entirely. This is the same insert /api/drops
 * does, same single-open-drop rule, just reachable from the curator
 * session a real person is already using instead of a bearer token —
 * /api/drops itself is untouched, for any script that still wants it.
 *
 * Canceled-aware guard, 2026-10-08 ("drop control" round — see
 * claude/next-build.md): the "is something already open" check looks
 * at the TRUE highest-numbered drop regardless of canceled status —
 * canceling a drop is deliberately NOT the same as it never having
 * existed, so the next drop started after a cancel still continues
 * from `last.num + 1`, never reusing the canceled number (the
 * founder's own explicit call). Only a drop that's neither shipped nor
 * canceled actually blocks starting a new one.
 */
export async function POST(request: Request) {
  const curator = await getSessionMember();
  if (!curator || !curator.isCurator) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const club = await getDefaultClub();
  if (curator.clubId !== club.id) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { title } = (body ?? {}) as { title?: string };

  const db = getDb();
  const [last] = await db
    .select()
    .from(drops)
    .where(eq(drops.clubId, club.id))
    .orderBy(desc(drops.num))
    .limit(1);

  if (last && !last.publishedAt && !last.canceledAt) {
    return NextResponse.json(
      { error: `Drop #${last.num} hasn't shipped yet — ship or cancel it before starting a new one.` },
      { status: 400 }
    );
  }

  const [created] = await db
    .insert(drops)
    .values({
      clubId: club.id,
      num: (last?.num ?? 0) + 1,
      title: title?.trim() || null,
      startedBy: curator.name || "A curator",
    })
    .returning();

  return NextResponse.json({ ok: true, drop: created });
}
