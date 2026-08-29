import { NextResponse } from "next/server";
import { getSubscriberByYouToken } from "@/lib/subscribers";
import { getTargetDropForTop10, getTop10Summary, submitTop10Pick } from "@/lib/top10Data";
import { isValidMusicLink } from "@/lib/musicLink";
import { resolveSongMetadata } from "@/lib/odesli";

/**
 * A subscriber's one-and-only Top 10 vote. Token-authorized like
 * /api/you/stop — the unguessable /you token itself is the proof this
 * is the subscriber's own submission, same trust model as the magic
 * link they clicked to get here. No login, no session.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = body as { token?: string; link?: string } | null;
  const token = parsed?.token;
  const link = parsed?.link?.trim();

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }
  if (!link || !isValidMusicLink(link)) {
    return NextResponse.json(
      { error: "That link doesn't look right — try pasting it again." },
      { status: 400 }
    );
  }

  const subscriber = await getSubscriberByYouToken(token);
  if (!subscriber) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const drop = await getTargetDropForTop10(subscriber.clubId);
  if (!drop) {
    return NextResponse.json({ error: "There's no Top 10 open right now." }, { status: 400 });
  }

  const summary = await getTop10Summary(drop);
  if (summary.phase !== "open") {
    return NextResponse.json({ error: "Submissions aren't open right now." }, { status: 400 });
  }

  // Best-effort, same pattern as every other submission point — a
  // failed/unreachable Odesli lookup still lets the vote count, it just
  // falls back to exact-link matching in tallyTop10 for that one vote.
  const metadata = await resolveSongMetadata(link);

  const result = await submitTop10Pick({
    dropId: drop.id,
    subscriberId: subscriber.id,
    link,
    title: metadata?.title ?? null,
    artist: metadata?.artist ?? null,
    artworkUrl: metadata?.artworkUrl ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "You've already submitted your pick for this one." }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    entry: {
      title: result.entry.title,
      artist: result.entry.artist,
      link: result.entry.link,
    },
  });
}
