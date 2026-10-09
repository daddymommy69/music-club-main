import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { clubs, type Club } from "@/db/schema";
import { siteUrl } from "./site";
import { spotifyClientCreds, spotifyBasicAuthHeader, refreshSpotifyAccessToken } from "./spotifyTokenRefresh";

/**
 * Spotify auto-build (2026-10 decision, see plan.md): a single Spotify
 * account — the founder's, which carries Premium — authorizes this app
 * once via OAuth, and that authorization is reused forever after to
 * create a playlist and upload its cover art each time a drop ships.
 * `playlist-modify-public` alone covers creating/editing public
 * playlists AND uploading a cover image (it's one of the three scopes
 * the image-upload endpoint accepts), so it's the only scope requested.
 *
 * Everything here is best-effort by design: any failure (no token saved
 * yet, a revoked token, Spotify being down) returns null/false rather
 * than throwing, so the ship flow's fallback to the manual paste-the-
 * link field (see api/overview/ship) never gets an unhandled exception
 * in its way.
 */

const SCOPE = "playlist-modify-public";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const API_BASE = "https://api.spotify.com/v1";

// Client-credentials lookup + refresh-token exchange both now live in
// spotifyTokenRefresh.ts, shared with visitorSpotify.ts (2026-10-09
// audit consolidation — see claude/next-build.md and that file's own
// header comment).
const clientCreds = spotifyClientCreds;

/** Same redirect path every time — derived from NEXT_PUBLIC_SITE_URL like
 * every other absolute URL in this app, so there's no separate env var to
 * keep in sync with it. Must be registered exactly as-is in the Spotify
 * app's dashboard under "Redirect URIs". */
export function spotifyRedirectUri(): string {
  return siteUrl("/api/spotify/callback");
}

/** True once SPOTIFY_CLIENT_ID/SECRET are both set — settings UI uses
 * this to explain an unconfigured app rather than showing a connect
 * button that can only fail. */
export function spotifyConfigured(): boolean {
  return clientCreds() != null;
}

export function getSpotifyAuthorizeUrl(state: string): string {
  const creds = clientCreds();
  if (!creds) throw new Error("SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET not set.");
  const params = new URLSearchParams({
    client_id: creds.clientId,
    response_type: "code",
    redirect_uri: spotifyRedirectUri(),
    scope: SCOPE,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** One-time exchange of the ?code= Spotify's callback hands back for a
 * refresh token, which is what actually gets persisted — access tokens
 * are short-lived (1 hour) and never stored. */
export async function exchangeSpotifyCode(code: string): Promise<string> {
  const creds = clientCreds();
  if (!creds) throw new Error("SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET not set.");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: spotifyBasicAuthHeader(creds),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: spotifyRedirectUri(),
    }),
  });

  if (!res.ok) {
    throw new Error(`Spotify token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { refresh_token?: string };
  if (!data.refresh_token) {
    throw new Error("Spotify didn't return a refresh token.");
  }
  return data.refresh_token;
}

export async function saveSpotifyRefreshToken(clubId: number, refreshToken: string): Promise<void> {
  const db = getDb();
  await db.update(clubs).set({ spotifyRefreshToken: refreshToken }).where(eq(clubs.id, clubId));
}

export async function disconnectSpotify(clubId: number): Promise<void> {
  const db = getDb();
  await db.update(clubs).set({ spotifyRefreshToken: null }).where(eq(clubs.id, clubId));
}

/**
 * Exchanges the club's stored refresh token for a fresh access token.
 * Returns null — never throws — whenever auto-build should quietly step
 * aside: no token saved yet, Spotify credentials not configured, or the
 * refresh call itself failing (revoked access, expired Premium account
 * no longer eligible, Spotify outage). Every caller treats null as "skip
 * auto-build, let the curator paste a link by hand like before."
 */
export async function getSpotifyAccessToken(club: Club): Promise<string | null> {
  if (!club.spotifyRefreshToken) return null;
  return refreshSpotifyAccessToken(club.spotifyRefreshToken, (newToken) =>
    saveSpotifyRefreshToken(club.id, newToken)
  );
}

export type SpotifyTrackMatch = { uri: string; id: string; artworkUrl: string | null };

/** Best-effort title+artist search, taking the top result. No fuzzy
 * scoring beyond what Spotify's own search relevance gives us — good
 * enough at this app's scale (a handful of curator-picked songs per
 * cycle, checked by a human before the playlist goes out).
 *
 * Also returns the matched track's album artwork (2026-10 release-page
 * redesign — see claude/next-build.md): Odesli, this app's previous
 * artwork source, has been dead since 2026-07-31, so Spotify's own
 * search response is now the only artwork source for songs that don't
 * already have one. Takes the largest image Spotify returns (images are
 * sorted largest-first); null if the track has none. */
export async function searchSpotifyTrack(
  accessToken: string,
  title: string,
  artist: string
): Promise<SpotifyTrackMatch | null> {
  try {
    const q = `track:${title} artist:${artist}`;
    const params = new URLSearchParams({ q, type: "track", limit: "1" });
    const res = await fetch(`${API_BASE}/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      tracks?: {
        items?: {
          uri: string;
          id: string;
          album?: { images?: { url: string }[] };
        }[];
      };
    };
    const track = data.tracks?.items?.[0];
    if (!track) return null;
    const artworkUrl = track.album?.images?.[0]?.url ?? null;
    return { uri: track.uri, id: track.id, artworkUrl };
  } catch {
    return null;
  }
}

export type SpotifyTrackById = { uri: string; title: string; artist: string; artworkUrl: string | null };

/** Direct id lookup — GET /tracks/{id} — used when a curator pastes a
 * Spotify link itself (2026-10-08 "Odesli is dead" fix — see
 * claude/next-build.md): the id is already right there in the URL, so
 * this is an exact match, not a text search guess the way
 * searchSpotifyTrack above has to be for anything that didn't start as
 * a Spotify link. */
export async function getSpotifyTrackById(accessToken: string, trackId: string): Promise<SpotifyTrackById | null> {
  try {
    const res = await fetch(`${API_BASE}/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      uri?: string;
      name?: string;
      artists?: { name: string }[];
      album?: { images?: { url: string }[] };
    };
    if (!data.uri || !data.name) return null;
    return {
      uri: data.uri,
      title: data.name,
      artist: data.artists?.[0]?.name ?? "",
      artworkUrl: data.album?.images?.[0]?.url ?? null,
    };
  } catch {
    return null;
  }
}

export type SpotifyArtistMatch = { id: string; photoUrl: string | null };

/** Best-effort artist-name search, taking the top result — same "no
 * fuzzy scoring beyond Spotify's own relevance" judgment call as
 * searchSpotifyTrack above. Backs the artist-photo cache
 * (src/lib/artists.ts) for the Browse page (2026-10-07 round — see
 * claude/next-build.md): since songs.artist is free text with no real
 * entity behind it, this is matched purely by name, and a name shared
 * by two different real-world artists will just get whichever one
 * Spotify ranks first — an accepted limitation, not a bug. */
export async function searchSpotifyArtist(accessToken: string, name: string): Promise<SpotifyArtistMatch | null> {
  try {
    const params = new URLSearchParams({ q: `artist:${name}`, type: "artist", limit: "1" });
    const res = await fetch(`${API_BASE}/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      artists?: { items?: { id: string; images?: { url: string }[] }[] };
    };
    const artist = data.artists?.items?.[0];
    if (!artist) return null;
    return { id: artist.id, photoUrl: artist.images?.[0]?.url ?? null };
  } catch {
    return null;
  }
}

export type SpotifyTrackSearchResult = {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  /** The track's normal open.spotify.com page — this is what gets
   * submitted as a Listener Pick's link (same field every manually-
   * pasted link already fills), not the internal spotify: URI. */
  externalUrl: string | null;
};

/** Free-text track search for Browse's search bar (2026-10-07 round —
 * see claude/next-build.md) — unlike searchSpotifyTrack above (one
 * best-guess match for a known title+artist pair), this takes whatever
 * the member types and returns several candidates for them to pick
 * from, the same way Spotify's own search box would. */
export async function searchSpotifyTracks(
  accessToken: string,
  query: string,
  limit = 8
): Promise<SpotifyTrackSearchResult[]> {
  try {
    const params = new URLSearchParams({ q: query, type: "track", limit: String(limit) });
    const res = await fetch(`${API_BASE}/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      tracks?: {
        items?: {
          id: string;
          name: string;
          artists?: { name: string }[];
          album?: { images?: { url: string }[] };
          external_urls?: { spotify?: string };
        }[];
      };
    };
    const items = data.tracks?.items ?? [];
    return items.map((t) => ({
      id: t.id,
      title: t.name,
      artist: t.artists?.[0]?.name ?? "",
      artworkUrl: t.album?.images?.[0]?.url ?? null,
      externalUrl: t.external_urls?.spotify ?? null,
    }));
  } catch {
    return [];
  }
}

export type CreatedPlaylist = { id: string; url: string };

export async function createSpotifyPlaylist(
  accessToken: string,
  name: string
): Promise<CreatedPlaylist | null> {
  try {
    const res = await fetch(`${API_BASE}/me/playlists`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, public: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id: string; external_urls?: { spotify?: string } };
    if (!data.id || !data.external_urls?.spotify) return null;
    return { id: data.id, url: data.external_urls.spotify };
  } catch {
    return null;
  }
}

/** Spotify caps this at 100 URIs per call; this app will never get
 * anywhere near that, but chunking costs nothing and means it never
 * silently breaks if that ever changes. */
export async function addTracksToPlaylist(
  accessToken: string,
  playlistId: string,
  uris: string[]
): Promise<boolean> {
  if (uris.length === 0) return true;
  try {
    for (let i = 0; i < uris.length; i += 100) {
      const chunk = uris.slice(i, i + 100);
      const res = await fetch(`${API_BASE}/playlists/${playlistId}/items`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: chunk }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** jpegBase64 must already be under Spotify's 256KB limit — see
 * src/lib/dropCover.ts, which targets well under that. */
export async function uploadPlaylistCover(
  accessToken: string,
  playlistId: string,
  jpegBase64: string
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/playlists/${playlistId}/images`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "image/jpeg",
      },
      body: jpegBase64,
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
