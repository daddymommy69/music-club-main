import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { clubs } from "@/db/schema";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";

/**
 * Sets (or clears) a curator-picked auto-open date for the NEXT drop
 * (2026-10-08 "drop control" round — see claude/next-build.md). Lives
 * on the club, not a drops row, since that drop doesn't exist yet —
 * the daily cron (src/app/api/cron/drops) is what actually creates it,
 * once this date passes and nothing's currently open. Only settable
 * while nothing IS currently open, so it can never conflict with an
 * active cycle.
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
  const { nextDropOpensAt } = (body ?? {}) as { nextDropOpensAt?: string | null };

  let parsed: Date | null = null;
  if (nextDropOpensAt) {
    parsed = new Date(nextDropOpensAt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "That date doesn't look right." }, { status: 400 });
    }
  }

  const openDrop = await getOpenDrop(club);
  if (openDrop) {
    return NextResponse.json(
      { error: `Drop #${openDrop.num} is still open — ship or cancel it before scheduling the next one.` },
      { status: 400 }
    );
  }

  // 2026-10-09 audit fix (see claude/next-build.md): no error handling
  // around this write before now — same class of bug as rename/cancel.
  try {
    const db = getDb();
    await db.update(clubs).set({ nextDropOpensAt: parsed }).where(eq(clubs.id, club.id));

    return NextResponse.json({ ok: true, nextDropOpensAt: parsed });
  } catch (err) {
    console.error("Schedule-open save failed:", err);
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  }
}
