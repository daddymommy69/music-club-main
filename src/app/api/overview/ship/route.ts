import { NextResponse } from "next/server";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";
import { isValidMusicLink } from "@/lib/musicLink";
import { shipDrop } from "@/lib/shipDrop";

/**
 * The "finish the drop" step — see src/lib/shipDrop.ts for what
 * actually happens (Spotify auto-build when the Spotify field's left
 * blank, then sendDropToSubscribers). Pulled apart from that shared
 * logic 2026-10-08 ("drop control" round — see claude/next-build.md)
 * so the new daily cron (src/app/api/cron/drops) can ship a drop on
 * its own, via the exact same code path, once its scheduledShipAt
 * passes — this route is now just "gather/validate the request, then
 * call shipDrop with shippedBy = the curator's own name."
 */
export async function PUT(request: Request) {
  const curator = await getSessionMember();
  if (!curator || !curator.isCurator) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const club = await getDefaultClub();
  if (curator.clubId !== club.id) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = body as { spotifyUrl?: string; appleUrl?: string; title?: string } | null;
  const spotifyUrl = parsed?.spotifyUrl?.trim() || null;
  const appleUrl = parsed?.appleUrl?.trim() || null;
  const title = parsed?.title?.trim() || null;

  if (spotifyUrl && !isValidMusicLink(spotifyUrl)) {
    return NextResponse.json({ error: "That Spotify link doesn't look right" }, { status: 400 });
  }
  if (appleUrl && !isValidMusicLink(appleUrl)) {
    return NextResponse.json({ error: "That Apple Music link doesn't look right" }, { status: 400 });
  }

  const drop = await getOpenDrop(club);
  if (!drop) {
    return NextResponse.json({ error: "No drop in progress right now." }, { status: 400 });
  }

  const result = await shipDrop(club, drop, {
    spotifyUrl,
    appleUrl,
    title,
    shippedBy: curator.name || "A curator",
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
