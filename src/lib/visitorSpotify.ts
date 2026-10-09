import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { members, type Member } from "@/db/schema";
import { siteUrl } from "./site";
import { spotifyClientCreds, spotifyBasicAuthHeader, refreshSpotifyAccessToken } from "./spotifyTokenRefresh";

/**
 * A VISITOR'S OWN Spotify connection (2026-10-08 "drop control +
 * playback" round — see claude/next-build.md) — entirely separate
 * from src/lib/spotify.ts, which is the one club-wide account that
 * auto-builds playlists. This is per-member, opt-in, and exists for
 * exactly one reason: full-track playback in that member's own browser
 * via Spotify's Web Playback SDK, which only works for a track once
 * Spotify itself confirms the connected account has Premium — no
 * amount of code here can change that, it's enforced on Spotify's
 * side. A member who never connects, or who connects without Premium,
 * always falls back to the 30-second preview embed everyone else gets
 * — see src/app/_components/NowPlayingProvider.tsx.
 *
 * Same client ID/secret as the club-level connection (one registered
 * Spotify app, two separate authorizations) — but its own redirect URI
 * and its own, narrower scope set: streaming + playback control, not
 * playlist-modify. The founder needs to add this redirect URI
 * (siteUrl("/api/account/spotify/callback")) to the Spotify app's
 * dashboard alongside the existing one before this works.
 */

const SCOPE = "streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";

// Client-credentials lookup + refresh-token exchange both now live in
// spotifyTokenRefresh.ts, shared with spotify.ts (2026-10-09 audit
// consolidation — see claude/next-build.md and that file's own header
// comment).
const clientCreds = spotifyClientCreds;

export function visitorSpotifyRedirectUri(): string {
  return siteUrl("/api/account/spotify/callback");
}

export function visitorSpotifyConfigured(): boolean {
  return clientCreds() != null;
}

export function getVisitorSpotifyAuthorizeUrl(state: string): string {
  const creds = clientCreds();
  if (!creds) throw new Error("SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET not set.");
  const params = new URLSearchParams({
    client_id: creds.clientId,
    response_type: "code",
    redirect_uri: visitorSpotifyRedirectUri(),
    scope: SCOPE,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeVisitorSpotifyCode(code: string): Promise<string> {
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
      redirect_uri: visitorSpotifyRedirectUri(),
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

export async function saveMemberSpotifyRefreshToken(memberId: number, refreshToken: string): Promise<void> {
  const db = getDb();
  await db.update(members).set({ spotifyRefreshToken: refreshToken }).where(eq(members.id, memberId));
}

export async function disconnectMemberSpotify(memberId: number): Promise<void> {
  const db = getDb();
  await db.update(members).set({ spotifyRefreshToken: null }).where(eq(members.id, memberId));
}

/**
 * Exchanges the member's stored refresh token for a fresh, short-lived
 * access token — handed straight to the client for the Web Playback
 * SDK to use (that's how Spotify's SDK is designed to work: a token
 * scoped only to this one member's own account, good for about an
 * hour). Returns null whenever playback should just fall back to the
 * preview embed instead: never connected, Spotify credentials not
 * configured, or the refresh itself failing (revoked access, Spotify
 * outage) — never throws.
 */
export async function getMemberSpotifyAccessToken(member: Member): Promise<string | null> {
  if (!member.spotifyRefreshToken) return null;
  return refreshSpotifyAccessToken(member.spotifyRefreshToken, (newToken) =>
    saveMemberSpotifyRefreshToken(member.id, newToken)
  );
}

/** Spotify's own answer to "can this account actually play full
 * tracks" — "premium", "free", or occasionally "open" for a very old
 * account tier. Null on any failure (never throws); every caller
 * treats anything other than exactly "premium" as "fall back to the
 * preview." */
export async function getSpotifyAccountProduct(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { product?: string };
    return data.product ?? null;
  } catch {
    return null;
  }
}
