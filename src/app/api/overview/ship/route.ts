import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops } from "@/db/schema";
import { getSessionCuratorId } from "@/lib/curatorSession";
import { getCuratorById } from "@/lib/curators";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";
import { isValidMusicLink } from "@/lib/musicLink";
import { sendDropToSubscribers } from "@/lib/release";

/**
 * The missing "finish the drop" step: /room only ever lets curators add
 * picks and notes to an unpublished drop, but nothing previously let
 * anyone attach that drop's final Spotify/Apple Music playlist link(s)
 * once it existed — the only place those columns ever got set was the
 * admin-only POST /api/drops call that starts a drop, and that route
 * refuses to run again while one is still open. That left no real path
 * from "curators finished picking" to "playlist link recorded".
 * Found and built 2026-08-29 while getting ready to actually deploy —
 * see plan.md.
 *
 * Saving here does the same thing manually starting a drop with links
 * already used to (`sendDropToSubscribers` in src/lib/release.ts): sets
 * the link(s), marks the drop published, and sends the release message —
 * one action, no separate "publish" step, same pattern as the Top 10
 * card's "paste the link" already uses.
 */
export async function PUT(request: Request) {
  const curatorId = await getSessionCuratorId();
  if (!curatorId) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const curator = await getCuratorById(curatorId);
  if (!curator) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const club = await getDefaultClub();
  if (curator.clubId !== club.id) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = body as { spotifyUrl?: string; appleUrl?: string; title?: string } | null;
  const spotifyUrl = parsed?.spotifyUrl?.trim() || null;
  const appleUrl = parsed?.appleUrl?.trim() || null;
  const title = parsed?.title?.trim() || null;

  if (!spotifyUrl && !appleUrl) {
    return NextResponse.json({ error: "Paste at least one playlist link" }, { status: 400 });
  }
  if (spotifyUrl && !isValidMusicLink(spotifyUrl)) {
    return NextResponse.json({ error: "That Spotify link doesn't look right" }, { status: 400 });
  }
  if (appleUrl && !isValidMusicLink(appleUrl)) {
    return NextResponse.json({ error: "That Apple Music link doesn't look right" }, { status: 400 });
  }

  const drop = await getOpenDrop(club);
  if (!drop) {
    return NextResponse.json({ error: "No drop in progress right now." }, { status: 400 });
  }

  const [updated] = await getDb()
    .update(drops)
    .set({
      ...(spotifyUrl ? { spotifyUrl } : {}),
      ...(appleUrl ? { appleUrl } : {}),
      ...(title ? { title } : {}),
    })
    .where(eq(drops.id, drop.id))
    .returning();

  // sendDropToSubscribers is what actually marks the drop published, sets
  // publishedAt, and sends the release message — same function every
  // other release path already goes through (/api/send, /api/cron/send).
  const result = await sendDropToSubscribers(updated);

  return NextResponse.json({ ok: true, dropNum: drop.num, ...result });
}
