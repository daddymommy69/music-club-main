import { NextResponse } from "next/server";
import { getSessionMember } from "@/lib/memberSession";
import { getMemberSpotifyAccessToken, getSpotifyAccountProduct } from "@/lib/visitorSpotify";

/**
 * What NowPlayingProvider calls once, the first time a visitor tries
 * to play something, to decide whether to attempt full playback via
 * Spotify's Web Playback SDK or just fall back to the preview embed.
 * Handing a short-lived access token to the client is how that SDK is
 * designed to work — it's scoped only to this one member's own
 * account and expires in about an hour. `premium: false` covers both
 * "not connected at all" and "connected but Spotify itself reports a
 * non-Premium account" — the client doesn't need to tell those apart,
 * both mean "use the preview."
 */
export async function GET() {
  const member = await getSessionMember();
  if (!member) {
    return NextResponse.json({ connected: false, premium: false, accessToken: null });
  }

  const accessToken = await getMemberSpotifyAccessToken(member);
  if (!accessToken) {
    return NextResponse.json({ connected: !!member.spotifyRefreshToken, premium: false, accessToken: null });
  }

  const product = await getSpotifyAccountProduct(accessToken);
  const premium = product === "premium";

  return NextResponse.json({ connected: true, premium, accessToken: premium ? accessToken : null });
}
