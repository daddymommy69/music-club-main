import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { exchangeSpotifyCode, saveSpotifyRefreshToken } from "@/lib/spotify";

const STATE_COOKIE = "gz_spotify_state";

/** Spotify redirects back here with ?code= on success or ?error= if the
 * curator declined. Either way we land back on /settings with a query
 * param SettingsBoard reads to show a result — see the Spotify section
 * there. */
export async function GET(request: Request) {
  const curator = await getSessionMember();
  if (!curator || !curator.isCurator) {
    return NextResponse.redirect(new URL("/curators", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  const settingsUrl = new URL("/settings", request.url);

  if (error) {
    settingsUrl.searchParams.set("spotify", "declined");
    return NextResponse.redirect(settingsUrl);
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    settingsUrl.searchParams.set("spotify", "error");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const refreshToken = await exchangeSpotifyCode(code);
    const club = await getDefaultClub();
    await saveSpotifyRefreshToken(club.id, refreshToken);
    settingsUrl.searchParams.set("spotify", "connected");
  } catch {
    settingsUrl.searchParams.set("spotify", "error");
  }

  return NextResponse.redirect(settingsUrl);
}
