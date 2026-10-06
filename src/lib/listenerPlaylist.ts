import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops, songs, type Club, type Song } from "@/db/schema";
import {
  getSpotifyAccessToken,
  searchSpotifyTrack,
  createSpotifyPlaylist,
  addTracksToPlaylist,
  uploadPlaylistCover,
} from "./spotify";
import { buildDropCoverJpegBase64 } from "./dropCover";

export type ListenerPlaylistBuildResult = {
  url: string;
  matchedCount: number;
  totalCount: number;
  unmatchedTitles: string[];
};

/**
 * The on-demand Listener Pick playlist build (2026-10 release-page
 * redesign — see claude/next-build.md). Deliberately NOT part of the
 * ship flow (src/lib/spotifyBuild.ts) that builds the curator playlist:
 * this one is triggered by a curator clicking "Build & open full
 * playlist on Spotify" whenever they want, on any already-published
 * drop, and the result is never emailed/texted out — see
 * api/drops/[dropId]/listener-playlist/route.ts. Same search/create/
 * add/cover-art mechanics as buildSpotifyPlaylistForDrop, just named
 * differently and persisted onto drops.listenerPlaylistUrl instead of
 * drops.spotifyUrl.
 *
 * Returns null to mean "quietly skip" — no Spotify connection, or
 * something critical failed outright — same contract as
 * buildSpotifyPlaylistForDrop.
 */
export async function buildListenerPickPlaylist(
  club: Club,
  dropId: number,
  dropNum: number,
  songList: Song[]
): Promise<ListenerPlaylistBuildResult | null> {
  if (songList.length === 0) return null;

  const accessToken = await getSpotifyAccessToken(club);
  if (!accessToken) return null;

  const matches = await Promise.all(
    songList.map((song) => searchSpotifyTrack(accessToken, song.title, song.artist))
  );

  const playlist = await createSpotifyPlaylist(accessToken, `Drop ${dropNum} — Listener Picks`);
  if (!playlist) return null;

  const matchedUris = matches.filter((m): m is NonNullable<typeof m> => m != null).map((m) => m.uri);
  const added = await addTracksToPlaylist(accessToken, playlist.id, matchedUris);
  if (!added) return null;

  const db = getDb();
  await Promise.all(
    songList.map((song, i) => {
      const match = matches[i];
      if (!match) return Promise.resolve();
      const patch: Partial<Song> = { spotifyUri: match.uri };
      if (!song.artworkUrl && match.artworkUrl) {
        patch.artworkUrl = match.artworkUrl;
      }
      return db.update(songs).set(patch).where(eq(songs.id, song.id));
    })
  );

  // Cover art is purely cosmetic — never let it block or fail the build.
  const artworkUrls = songList
    .slice(0, 4)
    .map((s, i) => s.artworkUrl ?? matches[i]?.artworkUrl ?? null);
  const cover = await buildDropCoverJpegBase64(artworkUrls, dropNum);
  if (cover) {
    await uploadPlaylistCover(accessToken, playlist.id, cover);
  }

  await db
    .update(drops)
    .set({ listenerPlaylistUrl: playlist.url, listenerPlaylistBuiltAt: new Date() })
    .where(eq(drops.id, dropId));

  const unmatchedTitles = songList
    .filter((_, i) => matches[i] == null)
    .map((s) => `${s.title} — ${s.artist}`);

  return {
    url: playlist.url,
    matchedCount: matchedUris.length,
    totalCount: songList.length,
    unmatchedTitles,
  };
}
