import { NextResponse } from "next/server";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";
import { getSpotifyAccessToken, searchSpotifyTracks } from "@/lib/spotify";
import { getSongSiteStats, searchSiteSongs } from "@/lib/browse";

/**
 * Browse's one search bar (2026-10-07 — see claude/next-build.md):
 * live Spotify search, enriched with this site's own stats whenever a
 * result happens to match a song that's already been featured here.
 * Best-effort end to end — an unconfigured/disconnected Spotify
 * connection returns `spotifyUnavailable: true` rather than an error,
 * so the client can fall back to "search isn't available, add your
 * pick manually" instead of a broken search box.
 *
 * Gained a ?source=site mode (2026-10-08 — see claude/next-build.md):
 * the founder wanted a way to check "have we already featured this"
 * without searching Spotify's whole catalog first. That branch never
 * touches Spotify at all — it's a plain search over this site's own
 * published songs (src/lib/browse.ts's searchSiteSongs), so it can
 * never be "unavailable" the way the Spotify branch can.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const source = searchParams.get("source") === "site" ? "site" : "spotify";
  if (!q) {
    return NextResponse.json({ ok: true, results: [], canSubmit: false });
  }

  const club = await getDefaultClub();

  if (source === "site") {
    const results = await searchSiteSongs(club.id, q);
    return NextResponse.json({ ok: true, results, canSubmit: false });
  }

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
