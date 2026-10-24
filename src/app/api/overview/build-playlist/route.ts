import { NextResponse } from "next/server";
import { asc, and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops, songs } from "@/db/schema";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { buildSpotifyPlaylistForDrop } from "@/lib/spotifyBuild";
import { getDropNotes } from "@/lib/notes";
import { combineDropNotes } from "@/lib/spotifyDescription";

/**
 * Curator-facing "build the Spotify playlist for this already-shipped
 * drop" button (2026-10-15 — founder's own ask: "build spotify playlist
 * button in curator since it will be resuable"). Same underlying
 * buildSpotifyPlaylistForDrop() as both the ship-time auto-build and the
 * one-off /api/admin/spotify-backfill route this replaces for curators —
 * that route still exists (ADMIN_SECRET-protected, not curator-facing),
 * this one just does the same thing behind ordinary curator session auth
 * so it's a button in Curator tools instead of a curl command. Only ever
 * targets a drop that's already shipped (publishedAt set) and doesn't
 * have a playlist yet — see getDropsMissingPlaylist (src/lib/archive.ts),
 * which is what drives the button showing up at all.
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
  const parsed = body as { dropNum?: number } | null;
  const dropNum = parsed?.dropNum;
  if (!Number.isInteger(dropNum)) {
    return NextResponse.json({ error: "dropNum (integer) required" }, { status: 400 });
  }

  const db = getDb();
  const [drop] = await db
    .select()
    .from(drops)
    .where(and(eq(drops.clubId, club.id), eq(drops.num, dropNum!)))
    .limit(1);

  if (!drop || !drop.publishedAt) {
    return NextResponse.json({ error: `No shipped drop #${dropNum} here.` }, { status: 404 });
  }
  if (drop.spotifyUrl) {
    return NextResponse.json({ error: "This drop already has a Spotify playlist." }, { status: 400 });
  }

  const dropSongs = await db
    .select()
    .from(songs)
    .where(eq(songs.dropId, drop.id))
    .orderBy(asc(songs.position), asc(songs.createdAt));

  const blurbText = combineDropNotes(await getDropNotes(drop.id));
  const result = await buildSpotifyPlaylistForDrop(club, drop.num, drop.title, dropSongs, blurbText);
  if (!result) {
    return NextResponse.json(
      { error: "Couldn't build it — check that Spotify is connected in Settings." },
      { status: 400 }
    );
  }

  await db.update(drops).set({ spotifyUrl: result.url }).where(eq(drops.id, drop.id));

  return NextResponse.json({
    ok: true,
    spotifyUrl: result.url,
    matchedCount: result.matchedCount,
    totalCount: result.totalCount,
    unmatchedTitles: result.unmatchedTitles,
  });
}
