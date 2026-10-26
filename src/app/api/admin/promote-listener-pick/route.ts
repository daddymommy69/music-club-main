import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops, songs, members } from "@/db/schema";
import { getDefaultClub } from "@/lib/club";
import { checkBearerAuth } from "@/lib/adminAuth";

/**
 * One-off: re-attribute a Listener Pick as a Curator Pick (2026-10-26
 * round — see claude/next-build.md). Founder's own report: a couple of
 * early submissions on Drop 2 went in through the Listener Pick flow
 * while a curator was still finding their way around the site, before
 * the song-choosing revamp — those were always meant to be Curator
 * Picks, filed in the wrong place by mistake. Listener Picks themselves
 * stay exactly as they are and keep working normally going forward
 * (the founder's own words: "keep the listener pick part, for future
 * changes when i add listener drops") — this only fixes rows that were
 * never really listener submissions to begin with.
 *
 * Re-attributes to whichever member already submitted it
 * (songs.submittedByMemberId) — no separate "who gets credit" input,
 * since that member is already right there on the row. They must
 * already be a curator (members.isCurator): a Curator Pick's
 * curatorId/curatorCredit only mean anything for one, and this route
 * refuses to invent a curator who doesn't exist. Mirrors exactly what
 * /api/room/picks/spotify sets when a curator adds a pick directly —
 * pickType="curator", curatorId/curatorCredit from that member,
 * submittedByMemberId cleared (a song row carries one role's fields or
 * the other, never both at once).
 *
 * curl -X POST https://yoursite/api/admin/promote-listener-pick \
 *   -H "Authorization: Bearer <ADMIN_SECRET>" \
 *   -H "Content-Type: application/json" \
 *   -d '{"dropNum": 2}'
 *
 * Converts every Listener Pick on that drop by default. Pass
 * "songIds": [12, 14] instead to convert only specific rows.
 */
export async function POST(request: Request) {
  if (!checkBearerAuth(request, "ADMIN_SECRET")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { dropNum, songIds } = body as { dropNum?: number; songIds?: number[] };
  if (!Number.isInteger(dropNum)) {
    return NextResponse.json({ error: "dropNum (integer) required" }, { status: 400 });
  }

  const club = await getDefaultClub();
  const db = getDb();

  const [drop] = await db
    .select()
    .from(drops)
    .where(and(eq(drops.clubId, club.id), eq(drops.num, dropNum!)))
    .limit(1);
  if (!drop) {
    return NextResponse.json({ error: `No drop #${dropNum} in this club.` }, { status: 404 });
  }

  const listenerSongs = await db
    .select()
    .from(songs)
    .where(and(eq(songs.dropId, drop.id), eq(songs.pickType, "listener")));

  const targets =
    songIds && songIds.length > 0 ? listenerSongs.filter((s) => songIds.includes(s.id)) : listenerSongs;

  if (targets.length === 0) {
    return NextResponse.json(
      { error: `No matching Listener Pick rows found on drop #${dropNum}.` },
      { status: 404 }
    );
  }

  const results: { songId: number; title: string; promotedTo: string | null; error?: string }[] = [];

  for (const song of targets) {
    if (!song.submittedByMemberId) {
      results.push({
        songId: song.id,
        title: song.title,
        promotedTo: null,
        error: "No submittedByMemberId on this row — can't tell who to credit.",
      });
      continue;
    }

    const [member] = await db.select().from(members).where(eq(members.id, song.submittedByMemberId)).limit(1);
    if (!member) {
      results.push({ songId: song.id, title: song.title, promotedTo: null, error: "Submitter's member row is gone." });
      continue;
    }
    if (!member.isCurator) {
      results.push({
        songId: song.id,
        title: song.title,
        promotedTo: null,
        error: `${member.name ?? "That member"} isn't a curator — can't credit a Curator Pick to them.`,
      });
      continue;
    }

    await db
      .update(songs)
      .set({
        pickType: "curator",
        curatorId: member.id,
        curatorCredit: member.name,
        submittedByMemberId: null,
      })
      .where(eq(songs.id, song.id));

    results.push({ songId: song.id, title: song.title, promotedTo: member.name });
  }

  return NextResponse.json({ ok: true, dropNum: drop.num, results });
}
