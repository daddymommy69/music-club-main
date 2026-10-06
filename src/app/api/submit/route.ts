import { NextResponse } from "next/server";
import { getDefaultClub } from "@/lib/club";
import { findMemberByEmail, findOrCreateMember } from "@/lib/members";
import { setMemberSession } from "@/lib/memberSession";
import { getOpenDrop } from "@/lib/room";
import { isValidMusicLink } from "@/lib/musicLink";
import { resolveAndSubmitListenerPick } from "@/lib/songSubmission";

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
 * The identity rule started out mirroring the fix made to
 * /api/subscribe (a bare email on a public form is not proof of who
 * typed it), but was tightened further on the 2026-10-06 QA sweep —
 * see claude/next-build.md's "impersonation via public /submit" note.
 * What changed: this route used to let a typed-in existing member's
 * email silently overwrite THAT MEMBER'S real Listener Pick — and
 * since a shipped Listener Pick gets public "picked by" credit under
 * the real member's name (this build's own policy), that meant anyone
 * could post a song publicly under a friend's real name with nothing
 * but their email address, no proof required. Now:
 *   - Email belongs to NO existing member → unchanged: a new member is
 *     created AND logged in immediately (trust-on-signup — there's
 *     nothing to protect yet).
 *   - Email already belongs to an existing member → the submission is
 *     refused outright, before it touches that member's pick at all.
 *     Managing an existing account's pick goes through /account's
 *     emailed code instead, which actually proves who's asking.
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
  if (existingMember) {
    return NextResponse.json(
      {
        error: "That email already has an account here — log in at /account to add or change your pick.",
        alreadyRegistered: true,
      },
      { status: 409 }
    );
  }
  const member = await findOrCreateMember(club, { name: parsed?.name, email });
  await setMemberSession(member.id);

  // member is always a brand-new row by this point (the existing-member
  // case returned above already) — resolveAndSubmitListenerPick's own
  // "edited" branch below only ever matches if a concurrent request for
  // the same new email raced this one and already created a pick in the
  // moment between the two.
  const result = await resolveAndSubmitListenerPick({
    dropId: drop.id,
    memberId: member.id,
    link,
    title: parsed?.title,
    artist: parsed?.artist,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.needsManualMetadata ? { needsManualMetadata: true } : {}) },
      { status: result.status }
    );
  }
  return NextResponse.json({ ok: true, mode: result.mode, song: result.song, loggedIn: true });
}
