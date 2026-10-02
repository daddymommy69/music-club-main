import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { clubs, type Club } from "@/db/schema";
import { siteUrl } from "./site";

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

function clientCreds(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

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
      Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}`,
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
  const creds = clientCreds();
  if (!creds) return null;

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: club.spotifyRefreshToken,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; refresh_token?: string };
    if (!data.access_token) return null;

    // Spotify sometimes rotates the refresh token on use — persist the
    // new one if given, or the next refresh would fail against a stale
    // value.
    if (data.refresh_token && data.refresh_token !== club.spotifyRefreshToken) {
      await saveSpotifyRefreshToken(club.id, data.refresh_token);
    }

    return data.access_token;
  } catch {
    return null;
  }
}

export type SpotifyTrackMatch = { uri: string; id: string };

/** Best-effort title+artist search, taking the top result. No fuzzy
 * scoring beyond what Spotify's own search relevance gives us — good
 * enough at this app's scale (a handful of curator-picked songs per
 * cycle, checked by a human before the playlist goes out). */
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
      tracks?: { items?: { uri: string; id: string }[] };
    };
    const track = data.tracks?.items?.[0];
    if (!track) return null;
    return { uri: track.uri, id: track.id };
  } catch {
    return null;
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
