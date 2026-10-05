import { NextResponse } from "next/server";
import { getDefaultClub } from "@/lib/club";
import { findMemberByEmail, findOrCreateMember } from "@/lib/members";
import { setMemberSession } from "@/lib/memberSession";
import { getOpenDrop } from "@/lib/room";
import { isValidMusicLink } from "@/lib/musicLink";
import { resolveSongMetadata } from "@/lib/odesli";
import { getListenerPick, submitListenerPick, editListenerPick } from "@/lib/listenerPicks";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The public, no-login `/submit` entry point (2026-10-06 — see
 * claude/next-build.md's "submit, revisited" note). This is
 * deliberately NOT the same thing as `/api/account/listener-pick`
 * (which requires an existing `requireMemberSession()` and powers
 * `/account`'s fuller dashboard): this route is the one-step "type
 * your email, paste a link, you're submitted" flow the founder asked
 * for after trying the fully-gated version — no separate sign-up step
 * shown, no code to type.
 *
 * The identity rule mirrors the fix just made to /api/subscribe, for
 * the same reason: a bare email on a public form is not proof of who
 * typed it.
 *   - Email belongs to NO existing member → a new member is created
 *     AND logged in immediately (same trust-on-signup spirit as
 *     /api/subscribe's "new member" branch — there's nothing to
 *     protect yet, so there's no downside to signing them in).
 *   - Email already belongs to an existing member → the submission
 *     still goes through, tied to that member's id (so attribution,
 *     the leaderboard, etc. are all correct), but this route does
 *     NOT call setMemberSession for them. Typing someone else's email
 *     here lets you submit/overwrite a song in their name — no worse
 *     than the old fully-anonymous submit box ever was — but it does
 *     NOT also hand you a live, cookie-based session as that person
 *     (which would let you see/edit their profile, favorites, past
 *     picks, etc. on /account). Wanting to manage an existing
 *     account's full history still goes through /account's emailed
 *     code, same as it does today.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = body as { name?: string; email?: string; link?: string; title?: string; artist?: string } | null;

  const email = parsed?.email?.trim() ?? "";
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const link = parsed?.link?.trim();
  if (!link || !isValidMusicLink(link)) {
    return NextResponse.json(
      { error: "That link doesn't look right — try pasting it again." },
      { status: 400 }
    );
  }

  const club = await getDefaultClub();
  const drop = await getOpenDrop(club);
  if (!drop) {
    return NextResponse.json({ error: "There's no drop open for submissions right now." }, { status: 400 });
  }

  const existingMember = await findMemberByEmail(club, email);
  const member = existingMember ?? (await findOrCreateMember(club, { name: parsed?.name, email }));
  if (!existingMember) {
    await setMemberSession(member.id);
  }

  const metadata = await resolveSongMetadata(link);
  const title = metadata?.title ?? parsed?.title?.trim() ?? "";
  const artist = metadata?.artist ?? parsed?.artist?.trim() ?? "";
  if (!title || !artist) {
    return NextResponse.json(
      {
        error:
          "We couldn't read that link automatically — add the title and artist yourself so we know what it is.",
        needsManualMetadata: true,
      },
      { status: 400 }
    );
  }
  const artworkUrl = metadata?.artworkUrl ?? null;

  const existingPick = await getListenerPick(drop.id, member.id);
  if (existingPick) {
    const updated = await editListenerPick(drop.id, member.id, { link, title, artist, artworkUrl });
    return NextResponse.json({ ok: true, mode: "edited", song: updated, loggedIn: !existingMember });
  }

  const result = await submitListenerPick({ dropId: drop.id, memberId: member.id, link, title, artist, artworkUrl });
  if (!result.ok) {
    return NextResponse.json({ error: "You've already got a pick in for this drop." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, mode: "created", song: result.song, loggedIn: !existingMember });
}
