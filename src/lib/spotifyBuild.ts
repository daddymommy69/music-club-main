import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { songs, type Club, type Song } from "@/db/schema";
import {
  getSpotifyAccessToken,
  searchSpotifyTrack,
  createSpotifyPlaylist,
  addTracksToPlaylist,
  uploadPlaylistCover,
} from "./spotify";
import { buildDropCoverJpegBase64 } from "./dropCover";
import { buildSpotifyDescription } from "./spotifyDescription";

export type SpotifyBuildResult = {
  url: string;
  matchedCount: number;
  totalCount: number;
  /** Titles (with artist) that didn't resolve on Spotify — this is what
   * lets the ship response "show it, blanked out" per founder decision
   * 2026-10, rather than silently dropping them from the playlist with
   * no trace. */
  unmatchedTitles: string[];
};

/**
 * The whole auto-build: search each song, create a public playlist,
 * add whatever matched, upload a matching cover image. Returns null to
 * mean "quietly skip" — no Spotify connection, or something critical
 * (search auth, playlist creation, adding tracks) failed outright —
 * which is exactly the signal api/overview/ship needs to fall back to
 * requiring a manual link, per founder decision 2026-10 on what
 * happens if the connection ever breaks. A playlist that got created
 * but came up short on matches is NOT a null result — see
 * unmatchedTitles.
 *
 * Playlist name/description (2026-10-15 — founder's own spec, revised
 * 2026-10-24): the name is whatever the drop is actually titled (same
 * curator-set `title` shown everywhere else on the site), falling
 * back to "Drop {num}" for an untitled drop, same convention as every
 * other "Drop N" fallback on the site — lowercased either way
 * (2026-10-24 round — founder's own call to make drop names lowercase
 * everywhere, titles are already saved lowercase at the source, this
 * just also covers the "Drop {num}" fallback, which isn't). The
 * description leads with the drop's own combined "About this drop"
 * blurb (empty if nothing's been posted yet), then always ends with
 * "Drop {num} | project music club" so the playlist is still
 * identifiable by number even when the title/blurb alone wouldn't say
 * which drop it is — see spotifyDescription.ts for the shared
 * budget/truncation logic the blurb's own character counter also
 * uses.
 *
 * `songList` must already be ordered the way the drop's tracklist reads
 * on the site (position, then createdAt — same ordering src/lib/room.ts
 * uses) since the first 4 are what both DropTile and the cover image
 * use as their artwork.
 */
export async function buildSpotifyPlaylistForDrop(
  club: Club,
  dropNum: number,
  dropTitle: string | null,
  songList: Song[],
  blurbText = ""
): Promise<SpotifyBuildResult | null> {
  if (songList.length === 0) return null;

  const accessToken = await getSpotifyAccessToken(club);
  if (!accessToken) return null;

  const matches = await Promise.all(
    songList.map((song) => searchSpotifyTrack(accessToken, song.title, song.artist))
  );

  const playlistName = (dropTitle?.trim() || `Drop ${dropNum}`).toLowerCase();
  const description = buildSpotifyDescription(dropNum, blurbText);
  const playlist = await createSpotifyPlaylist(accessToken, playlistName, description);
  if (!playlist) return null;

  const matchedUris = matches.filter((m): m is NonNullable<typeof m> => m != null).map((m) => m.uri);
  const added = await addTracksToPlaylist(accessToken, playlist.id, matchedUris);
  if (!added) return null;

  // Persist per-song matches only once the playlist genuinely has them —
  // keeps this column meaning "actually in the live playlist," not
  // "we once found a candidate." Also backfills artworkUrl from the same
  // Spotify search result, but only where a song doesn't already have
  // one (2026-10 decision: Odesli, the old artwork source, is dead, so
  // this is the real fix — never overwrites an existing value, since a
  // song could already have artwork from a source other than Spotify).
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
  // Use the freshly-backfilled artwork too (not just whatever the song
  // already had), so the cover benefits from the same Spotify lookup.
  const artworkUrls = songList
    .slice(0, 4)
    .map((s, i) => s.artworkUrl ?? matches[i]?.artworkUrl ?? null);
  const cover = await buildDropCoverJpegBase64(artworkUrls, dropNum);
  if (cover) {
    await uploadPlaylistCover(accessToken, playlist.id, cover);
  }

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
