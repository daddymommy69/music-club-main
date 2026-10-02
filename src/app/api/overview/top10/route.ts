import { NextResponse } from "next/server";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { getTargetDropForTop10, getTop10Summary, setTop10Links } from "@/lib/top10Data";
import { isValidMusicLink } from "@/lib/musicLink";
import { sendTop10ToSubscribers } from "@/lib/release";

/**
 * Curator pastes in the Subscriber Top 10 playlist link(s), once the
 * window has closed with 10+ unique songs — same manual "curator builds
 * it, pastes the link" pattern as every main drop's playlist, no
 * Spotify API involved. Saving here is what fires the Top 10 release
 * message to subscribers (src/lib/release.ts's sendTop10ToSubscribers) —
 * there's no separate "publish" step.
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
  const parsed = body as { spotifyUrl?: string; appleUrl?: string } | null;
  const spotifyUrl = parsed?.spotifyUrl?.trim() || null;
  const appleUrl = parsed?.appleUrl?.trim() || null;

  if (!spotifyUrl && !appleUrl) {
    return NextResponse.json({ error: "Paste at least one playlist link" }, { status: 400 });
  }
  if (spotifyUrl && !isValidMusicLink(spotifyUrl)) {
    return NextResponse.json({ error: "That Spotify link doesn't look right" }, { status: 400 });
  }
  if (appleUrl && !isValidMusicLink(appleUrl)) {
    return NextResponse.json({ error: "That Apple Music link doesn't look right" }, { status: 400 });
  }

  const drop = await getTargetDropForTop10(club.id);
  if (!drop) {
    return NextResponse.json({ error: "No Top 10 result to attach a playlist to yet." }, { status: 400 });
  }

  const summary = await getTop10Summary(drop);
  if (summary.phase !== "closed") {
    return NextResponse.json({ error: "The Top 10 window hasn't closed yet." }, { status: 400 });
  }
  if (!summary.hitThreshold) {
    return NextResponse.json(
      { error: "Fewer than 10 unique songs came in — there's no playlist to build for this one." },
      { status: 400 }
    );
  }

  const wasAlreadySet = !!(drop.top10SpotifyUrl || drop.top10AppleUrl);

  const updated = await setTop10Links(drop.id, {
    ...(spotifyUrl ? { spotifyUrl } : {}),
    ...(appleUrl ? { appleUrl } : {}),
  });

  // Announce once — the first time a link gets set for this drop's Top
  // 10, not on every subsequent edit (e.g. adding the Apple Music link
  // a bit after the Spotify one shouldn't re-text everyone). Awaited,
  // same as sendDropToSubscribers's callers (/api/send, /api/cron/send)
  // — an unawaited send risks the serverless function freezing before
  // it finishes.
  let sendResult: Awaited<ReturnType<typeof sendTop10ToSubscribers>> | null = null;
  if (!wasAlreadySet) {
    try {
      sendResult = await sendTop10ToSubscribers(drop.num);
    } catch (err) {
      console.error("Top 10 release send failed:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    top10SpotifyUrl: updated.top10SpotifyUrl,
    top10AppleUrl: updated.top10AppleUrl,
    sent: sendResult?.sent ?? null,
  });
}
