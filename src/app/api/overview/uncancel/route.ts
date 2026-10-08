import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops } from "@/db/schema";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";

/**
 * Reverses a cancel (2026-10-08 "drop control" round — see
 * claude/next-build.md: the founder's explicit "can be uncancelled").
 * Guarded to only the TRUE highest-numbered drop for the club, canceled
 * or not — reopening an older canceled drop while a newer one has
 * since been started would create two "open" drops at once, which
 * every other part of this app assumes can never happen (getOpenDrop,
 * the single-open-drop guard on /api/overview/start-drop, etc. all
 * expect at most one unshipped, uncanceled row). src/lib/overview.ts's
 * canceledDrop field uses this exact same check, so the "Un-cancel"
 * button only ever shows when this route would actually succeed.
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

  const db = getDb();
  const [latest] = await db
    .select()
    .from(drops)
    .where(eq(drops.clubId, club.id))
    .orderBy(desc(drops.num))
    .limit(1);

  if (!latest || !latest.canceledAt) {
    return NextResponse.json({ error: "Nothing to un-cancel right now." }, { status: 400 });
  }

  await db
    .update(drops)
    .set({ canceledAt: null, canceledBy: null })
    .where(eq(drops.id, latest.id));

  return NextResponse.json({ ok: true, dropNum: latest.num });
}
