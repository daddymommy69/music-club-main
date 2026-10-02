import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops, songs } from "@/db/schema";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";
import { isValidMusicLink } from "@/lib/musicLink";
import { sendDropToSubscribers } from "@/lib/release";
import { buildSpotifyPlaylistForDrop } from "@/lib/spotifyBuild";

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
 *
 * Spotify auto-build (2026-10): if the curator leaves the Spotify field
 * blank, this now tries to build that playlist automatically from the
 * drop's songs before shipping — no separate step, same one "Ship"
 * click. A pasted Spotify link always wins over auto-build (it's the
 * manual-fallback path per founder decision, for whenever the Spotify
 * connection is down or someone wants to override it). Auto-build
 * failing for any reason — not connected, Spotify down, whatever — is
 * never an error here; it just leaves spotifyUrl unset, same as if the
 * curator had left the field blank before this feature existed.
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

  const body = await request.json().catch(() => null);
  const parsed = body as { spotifyUrl?: string; appleUrl?: string; title?: string } | null;
  let spotifyUrl = parsed?.spotifyUrl?.trim() || null;
  const appleUrl = parsed?.appleUrl?.trim() || null;
  const title = parsed?.title?.trim() || null;

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

  // A pasted link always wins — this is the manual-fallback path for
  // whenever auto-build isn't connected or someone wants to override it.
  // Only reach for auto-build when the field was actually left blank.
  let spotifyBuild: Awaited<ReturnType<typeof buildSpotifyPlaylistForDrop>> = null;
  if (!spotifyUrl) {
    const dropSongs = await getDb()
      .select()
      .from(songs)
      .where(eq(songs.dropId, drop.id))
      .orderBy(asc(songs.position), asc(songs.createdAt));
    spotifyBuild = await buildSpotifyPlaylistForDrop(club, drop.num, dropSongs);
    if (spotifyBuild) spotifyUrl = spotifyBuild.url;
  }

  if (!spotifyUrl && !appleUrl) {
    return NextResponse.json(
      {
        error:
          "Couldn't auto-build a Spotify playlist and no Apple Music link was pasted — paste at least one link to ship.",
      },
      { status: 400 }
    );
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

  return NextResponse.json({
    ok: true,
    dropNum: drop.num,
    ...result,
    spotifyAutoBuild: spotifyBuild
      ? {
          matchedCount: spotifyBuild.matchedCount,
          totalCount: spotifyBuild.totalCount,
          unmatchedTitles: spotifyBuild.unmatchedTitles,
        }
      : null,
  });
}
