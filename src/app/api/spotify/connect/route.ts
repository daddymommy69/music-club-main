import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { getSessionMember } from "@/lib/memberSession";
import { getSpotifyAuthorizeUrl, spotifyConfigured } from "@/lib/spotify";

const STATE_COOKIE = "gz_spotify_state";

/**
 * Kicks off the one-time Spotify connect flow from /settings — whichever
 * curator clicks "Connect Spotify" there is the account every auto-built
 * playlist gets created under from then on (founder decision 2026-10:
 * just one account, no per-curator connections). A short-lived random
 * `state` value round-trips through Spotify and back to the callback
 * route as basic CSRF protection, the same way an OAuth "state" param is
 * meant to be used.
 */
export async function GET(request: Request) {
  const curator = await getSessionMember();
  if (!curator || !curator.isCurator) {
    return NextResponse.redirect(new URL("/curators", request.url));
  }
  if (!spotifyConfigured()) {
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
    maxAge: 600, // 10 minutes is plenty for an interactive OAuth redirect
    path: "/",
  });

  return NextResponse.redirect(getSpotifyAuthorizeUrl(state));
}
