import { NextResponse } from "next/server";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { getSpotifyAccessToken, searchSpotifyTracks } from "@/lib/spotify";

/**
 * Curator-facing Spotify search for the "Add a pick" box in /account's
 * curator tools (2026-10-08 curator tools redesign — see
 * claude/next-build.md, replacing the old paste-a-link flow). Mirrors
 * /api/browse/search almost exactly — same searchSpotifyTracks call,
 * same spotifyUnavailable fallback signal — just gated to a logged-in
 * curator instead of public, and without Browse's "already featured on
 * this site" stats enrichment, which has no use mid-pick.
 */
export async function GET(request: Request) {
  const curator = await getSessionMember();
  if (!curator || !curator.isCurator) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ ok: true, results: [] });
  }

  const club = await getDefaultClub();
  if (curator.clubId !== club.id) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const accessToken = await getSpotifyAccessToken(club);
  if (!accessToken) {
    // Same signal Browse's search already uses — the client falls back
    // to the old paste-a-link form rather than being stuck with no way
    // to add a pick at all.
    return NextResponse.json({ ok: false, spotifyUnavailable: true, results: [] });
  }

  const results = await searchSpotifyTracks(accessToken, q, 8);
  return NextResponse.json({ ok: true, results });
}
