import { NextResponse } from "next/server";
import { getDefaultClub } from "@/lib/club";
import { findMemberByEmail, issueLoginCode, maskEmail, isFounderEmail, ensureFounderAccess } from "@/lib/members";

const NOT_A_CURATOR_MESSAGE =
  "This email isn't set up as a curator yet — ask an admin, or sign up as a member at /signup first if you haven't.";

/**
 * Step 1 of curator login (email-only now — see CuratorLogin.tsx).
 * There's no self-serve join-code path anymore: a login only succeeds
 * for a member that already exists AND already has isCurator set by an
 * admin. Anything else gets the same "ask an admin" message, whether
 * the email has no member at all or belongs to a non-curator member —
 * no need to tell those two cases apart for someone trying to log in.
 *
 * One exception (2026-10-06 — see members.ts's isFounderEmail/
 * ensureFounderAccess and claude/next-build.md): the email in
 * FOUNDER_EMAIL always gets access here, even as the very first login
 * ever, bootstrapping itself into a member with isCurator/isAdmin both
 * true instead of needing a hand-run SQL UPDATE. The 6-digit code below
 * still gets sent and still has to be typed in before any session
 * exists, same as for every other curator — this only changes whether
 * a code gets sent, never who can get in just by typing an address.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = (body as { email?: string } | null)?.email?.trim();

  if (!email) {
    return NextResponse.json({ error: "Enter your email" }, { status: 400 });
  }

  const club = await getDefaultClub();
  let member = await findMemberByEmail(club, email);

  if ((!member || !member.isCurator) && isFounderEmail(email)) {
    member = await ensureFounderAccess(club, email);
  }

  if (!member || !member.isCurator) {
    return NextResponse.json({ error: NOT_A_CURATOR_MESSAGE }, { status: 400 });
  }

  await issueLoginCode(member);

  return NextResponse.json({
    memberId: member.id,
    masked: maskEmail(email),
  });
}
