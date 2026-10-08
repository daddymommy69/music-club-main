import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { getSessionMember } from "@/lib/memberSession";
import { getVisitorSpotifyAuthorizeUrl, visitorSpotifyConfigured } from "@/lib/visitorSpotify";

const STATE_COOKIE = "gz_visitor_spotify_state";

/**
 * Kicks off a VISITOR'S OWN Spotify connect flow (2026-10-08 "drop
 * control + playback" round — see claude/next-build.md) — any logged-
 * in member, not curator-only, since this is purely about full-track
 * playback in their own browser. Entirely separate from
 * /api/spotify/connect (the one club-wide account that auto-builds
 * playlists). Same short-lived-cookie CSRF `state` pattern as that
 * route.
 */
export async function GET(request: Request) {
  const member = await getSessionMember();
  if (!member) {
    return NextResponse.redirect(new URL("/account", request.url));
  }
  if (!visitorSpotifyConfigured()) {
    return NextResponse.json(
      { error: "SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET aren't set." },
      { status: 500 }
    );
  }

  const state = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(getVisitorSpotifyAuthorizeUrl(state));
}
