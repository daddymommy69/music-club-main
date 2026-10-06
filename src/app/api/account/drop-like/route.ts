import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops } from "@/db/schema";
import { requireMemberSession } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { toggleDropLike } from "@/lib/dropLikes";

/** Toggles the signed-in member's whole-drop like, on any shipped drop (past or current) — see claude/next-build.md. */
export async function POST(request: Request) {
  const member = await requireMemberSession();
  if (!member) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const dropId = (body as { dropId?: number } | null)?.dropId;
  if (!dropId || !Number.isInteger(dropId)) {
    return NextResponse.json({ error: "dropId is required" }, { status: 400 });
  }

  const club = await getDefaultClub();
  const db = getDb();
  const [drop] = await db
    .select({ id: drops.id })
    .from(drops)
    .where(and(eq(drops.id, dropId), eq(drops.clubId, club.id), isNotNull(drops.publishedAt)))
    .limit(1);
  if (!drop) {
    return NextResponse.json({ error: "That drop doesn't exist" }, { status: 404 });
  }

  const result = await toggleDropLike(dropId, member.id);
  return NextResponse.json(result);
}
