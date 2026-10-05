import { NextResponse } from "next/server";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops } from "@/db/schema";
import { requireMemberSession } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { setMemberFavorites, InvalidFavoritesError } from "@/lib/favorites";

/** Replaces the signed-in member's favorite-drops showcase (up to 5, ordered by array order) in one call. dropIds are real drops.id values, same ones /account's picker was built from. */
export async function POST(request: Request) {
  const member = await requireMemberSession();
  if (!member) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const dropIds = (body as { dropIds?: unknown } | null)?.dropIds;
  if (!Array.isArray(dropIds) || !dropIds.every((id) => Number.isInteger(id))) {
    return NextResponse.json({ error: "dropIds must be an array of drop ids" }, { status: 400 });
  }

  // Only shipped drops belonging to this club are ever offered as
  // favorites — check against the real published set rather than
  // trusting the client's list.
  if (dropIds.length > 0) {
    const club = await getDefaultClub();
    const db = getDb();
    const validRows = await db
      .select({ id: drops.id })
      .from(drops)
      .where(and(eq(drops.clubId, club.id), isNotNull(drops.publishedAt), inArray(drops.id, dropIds as number[])));
    if (validRows.length !== new Set(dropIds).size) {
      return NextResponse.json({ error: "One of those drops isn't a real, shipped drop." }, { status: 400 });
    }
  }

  try {
    const favorites = await setMemberFavorites(member.id, dropIds as number[]);
    return NextResponse.json({ ok: true, favorites });
  } catch (err) {
    if (err instanceof InvalidFavoritesError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
