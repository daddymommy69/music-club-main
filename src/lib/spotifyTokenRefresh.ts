/**
 * Shared Spotify OAuth pieces (2026-10-09 audit consolidation — see
 * claude/next-build.md): spotify.ts (the one club-wide connection that
 * auto-builds playlists) and visitorSpotify.ts (each visitor's own,
 * separate, opt-in connection for full-track playback) used to each
 * carry their own near-identical copy of the client-credentials lookup
 * and the refresh-token→access-token exchange, including the "Spotify
 * sometimes rotates the refresh token on use, persist the new one if
 * given" handling. One real difference between the two systems — the
 * authorization_code exchange (the one-time "you just approved this
 * app" step) — still lives in each file separately, since their scopes
 * and redirect URIs genuinely differ; only the part that was truly
 * identical moved here.
 */

const TOKEN_URL = "https://accounts.spotify.com/api/token";

export type SpotifyClientCreds = { clientId: string; clientSecret: string };

/** True once SPOTIFY_CLIENT_ID/SECRET are both set — both connection
 * systems share the one registered Spotify app. */
export function spotifyClientCreds(): SpotifyClientCreds | null {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function spotifyBasicAuthHeader(creds: SpotifyClientCreds): string {
  return `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}`;
}

/**
 * Exchanges a stored refresh token for a fresh, short-lived access
 * token. Never throws — returns null whenever the caller should just
 * fall back (club auto-build falls back to a pasted link; visitor
 * playback falls back to the preview embed): credentials not
 * configured, or the refresh call itself failing (revoked access,
 * Spotify outage). `onRotated` persists a new refresh token if Spotify
 * hands one back — both callers pass their own save function (the
 * club's `clubId` vs. a member's `id`), so this stays agnostic to which
 * system is calling it.
 */
export async function refreshSpotifyAccessToken(
  refreshToken: string,
  onRotated?: (newRefreshToken: string) => Promise<void>
): Promise<string | null> {
  const creds = spotifyClientCreds();
  if (!creds) return null;

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: spotifyBasicAuthHeader(creds),
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; refresh_token?: string };
    if (!data.access_token) return null;

    if (data.refresh_token && data.refresh_token !== refreshToken && onRotated) {
      await onRotated(data.refresh_token);
    }

    return data.access_token;
  } catch {
    return null;
  }
}
