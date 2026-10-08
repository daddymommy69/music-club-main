import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionMember } from "@/lib/memberSession";
import { exchangeVisitorSpotifyCode, saveMemberSpotifyRefreshToken } from "@/lib/visitorSpotify";

const STATE_COOKIE = "gz_visitor_spotify_state";

/** Spotify redirects back here with ?code= on success or ?error= if the
 * visitor declined. Either way we land back on /account with a query
 * param AccountBoard reads to show a result, same pattern as the
 * club-level /api/spotify/callback uses for /settings. */
export async function GET(request: Request) {
  const member = await getSessionMember();
  if (!member) {
    return NextResponse.redirect(new URL("/account", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  const accountUrl = new URL("/account", request.url);

  if (error) {
    accountUrl.searchParams.set("spotify", "declined");
    return NextResponse.redirect(accountUrl);
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    accountUrl.searchParams.set("spotify", "error");
    return NextResponse.redirect(accountUrl);
  }

  try {
    const refreshToken = await exchangeVisitorSpotifyCode(code);
    await saveMemberSpotifyRefreshToken(member.id, refreshToken);
    accountUrl.searchParams.set("spotify", "connected");
  } catch {
    accountUrl.searchParams.set("spotify", "error");
  }

  return NextResponse.redirect(accountUrl);
}
