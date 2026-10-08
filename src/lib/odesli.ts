/**
 * Link -> title/artist/artwork(+Spotify id) for a pasted Spotify or
 * Apple Music link. Despite the file name (kept as-is so every existing
 * import across the codebase didn't need to change), this no longer
 * calls Odesli/song.link — that free service shut down for good on
 * 2026-07-31, which is also why the "auto-find the Spotify version"
 * backfill came back 0 matches on every song (2026-10-08 — see
 * claude/next-build.md for the full story). It now resolves each kind
 * of link directly against its own platform instead of a third-party
 * aggregator: a Spotify link's id is already in the URL, so that's an
 * exact lookup against Spotify's own API; an Apple Music link goes
 * through Apple's free, no-auth iTunes Lookup API
 * (src/lib/appleMusic.ts) for title/artist/artwork, then — same as
 * before — tries a best-effort Spotify title/artist search so a pasted
 * Apple Music link can still be playable immediately, not just after
 * ship-day's own fuzzy match.
 *
 * Deliberately keeps resolveSongMetadata(url)'s original signature (no
 * new required params) — it looks up the club itself internally, the
 * same single-row, no-context-needed call every other route already
 * makes (see src/lib/club.ts's own comment: "only one club launches").
 * That's what let this fix apply everywhere this function is already
 * called — curator picks, public submissions, Listener Picks, SMS,
 * Top 10 — without touching any of those call sites.
 *
 * Best-effort only, same as before: a submission still succeeds with
 * no metadata if every lookup here fails or times out.
 */
import { getDefaultClub } from "./club";
import { getSpotifyAccessToken, getSpotifyTrackById, searchSpotifyTrack } from "./spotify";
import { resolveAppleMusicTrack } from "./appleMusic";

export type OdesliMetadata = {
  title: string;
  artist: string;
  artworkUrl: string | null;
  /** `spotify:track:<id>` — null when this song isn't resolvable on
   * Spotify at all (no match on a title/artist search), or the club's
   * Spotify connection isn't available to search with in the first
   * place. A pasted Spotify link always resolves this (it's an exact
   * id lookup); a pasted Apple Music link gets it on a best-effort
   * basis, same spirit as ship-time auto-build's own matching. */
  spotifyUri: string | null;
};

const SPOTIFY_TRACK_URL_RE = /open\.spotify\.com\/track\/([A-Za-z0-9]+)/;

export async function resolveSongMetadata(url: string): Promise<OdesliMetadata | null> {
  const club = await getDefaultClub();
  const accessToken = await getSpotifyAccessToken(club);

  const spotifyMatch = url.match(SPOTIFY_TRACK_URL_RE);
  if (spotifyMatch) {
    if (!accessToken) return null;
    const track = await getSpotifyTrackById(accessToken, spotifyMatch[1]);
    if (!track) return null;
    return {
      title: track.title,
      artist: track.artist,
      artworkUrl: track.artworkUrl,
      spotifyUri: track.uri,
    };
  }

  const apple = await resolveAppleMusicTrack(url);
  if (!apple) return null;

  let spotifyUri: string | null = null;
  if (accessToken) {
    const match = await searchSpotifyTrack(accessToken, apple.title, apple.artist);
    if (match) spotifyUri = match.uri;
  }

  return {
    title: apple.title,
    artist: apple.artist,
    artworkUrl: apple.artworkUrl,
    spotifyUri,
  };
}
