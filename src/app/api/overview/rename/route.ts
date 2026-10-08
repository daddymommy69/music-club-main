import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops } from "@/db/schema";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";

/**
 * Rename the currently-open drop (2026-10-08 "drop control" round —
 * see claude/next-build.md). The founder's own scoping, verbatim:
 * "just before the drop, cant change after" — any curator can rename
 * it any time while it's still open, but it locks the moment it ships
 * (getOpenDrop only ever returns an unshipped, uncanceled drop, so
 * this route has nothing to operate on once that happens — same
 * enforcement every other curator-only mutation here already uses).
 * "whoever is a curator during the time of the drop can rename it" —
 * no per-drop ownership, any current curator.
 */
export async function PUT(request: Request) {
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

  const drop = await getOpenDrop(club);
  if (!drop) {
    return NextResponse.json({ error: "No drop in progress right now." }, { status: 400 });
  }

  const db = getDb();
  const [updated] = await db
    .update(drops)
    .set({
      title: title?.trim() || null,
      titleUpdatedBy: curator.name || "A curator",
      titleUpdatedAt: new Date(),
    })
    .where(eq(drops.id, drop.id))
    .returning();

  return NextResponse.json({
    ok: true,
    title: updated.title,
    titleUpdatedBy: updated.titleUpdatedBy,
    titleUpdatedAt: updated.titleUpdatedAt,
  });
}
