import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops } from "@/db/schema";
import { requireMemberSession } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { setDropRating, InvalidRatingError } from "@/lib/ratings";

/** Sets the signed-in member's 1-5 rating for a shipped drop (upsert). */
export async function POST(request: Request) {
  const member = await requireMemberSession();
  if (!member) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { dropId, rating } = (body ?? {}) as { dropId?: number; rating?: number };
  if (!dropId || !Number.isInteger(dropId)) {
    return NextResponse.json({ error: "dropId is required" }, { status: 400 });
  }
  if (typeof rating !== "number") {
    return NextResponse.json({ error: "rating is required" }, { status: 400 });
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

  try {
    const result = await setDropRating(dropId, member.id, rating);
    return NextResponse.json({ ok: true, rating: result.rating });
  } catch (err) {
    if (err instanceof InvalidRatingError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
