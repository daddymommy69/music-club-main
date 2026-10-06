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

  // Same guard as /api/drops: a second open drop before the first ships
  // would silently orphan it, since every "current drop" lookup in this
  // app only ever looks at the highest drop.num.
  if (last && !last.publishedAt) {
    return NextResponse.json(
      { error: `Drop #${last.num} hasn't shipped yet — ship it before starting a new one.` },
      { status: 400 }
    );
  }

  const [created] = await db
    .insert(drops)
    .values({
      clubId: club.id,
      num: (last?.num ?? 0) + 1,
      title: title?.trim() || null,
    })
    .returning();

  return NextResponse.json({ ok: true, drop: created });
}
