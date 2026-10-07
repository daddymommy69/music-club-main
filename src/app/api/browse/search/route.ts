import { NextResponse } from "next/server";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";
import { getSpotifyAccessToken, searchSpotifyTracks } from "@/lib/spotify";
import { getSongSiteStats } from "@/lib/browse";

/**
 * Browse's one search bar (2026-10-07 — see claude/next-build.md):
 * live Spotify search, enriched with this site's own stats whenever a
 * result happens to match a song that's already been featured here.
 * Best-effort end to end — an unconfigured/disconnected Spotify
 * connection returns `spotifyUnavailable: true` rather than an error,
 * so the client can fall back to "search isn't available, add your
 * pick manually" instead of a broken search box.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ ok: true, results: [], canSubmit: false });
  }

  const club = await getDefaultClub();
  const [accessToken, openDrop] = await Promise.all([getSpotifyAccessToken(club), getOpenDrop(club)]);

  if (!accessToken) {
    return NextResponse.json({ ok: false, spotifyUnavailable: true, results: [], canSubmit: false });
  }

  const tracks = await searchSpotifyTracks(accessToken, q, 8);
  const results = await Promise.all(
    tracks.map(async (t) => ({
      ...t,
      site: await getSongSiteStats(club, t.title, t.artist),
    }))
  );

  return NextResponse.json({ ok: true, results, canSubmit: !!openDrop });
}
