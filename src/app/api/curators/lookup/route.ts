import { NextResponse } from "next/server";
import { getDefaultClub } from "@/lib/club";
import { findMemberByEmail, issueLoginCode, maskEmail } from "@/lib/members";

const NOT_A_CURATOR_MESSAGE =
  "This email isn't set up as a curator yet — ask an admin, or sign up as a member at /signup first if you haven't.";

/**
 * Step 1 of curator login (email-only now — see CuratorLogin.tsx).
 * There's no self-serve join-code path anymore: a login only succeeds
 * for a member that already exists AND already has isCurator set by an
 * admin. Anything else gets the same "ask an admin" message, whether
 * the email has no member at all or belongs to a non-curator member —
 * no need to tell those two cases apart for someone trying to log in.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = (body as { email?: string } | null)?.email?.trim();

  if (!email) {
    return NextResponse.json({ error: "Enter your email" }, { status: 400 });
  }

  const club = await getDefaultClub();
  const member = await findMemberByEmail(club, email);

  if (!member || !member.isCurator) {
    return NextResponse.json({ error: NOT_A_CURATOR_MESSAGE }, { status: 400 });
  }

  await issueLoginCode(member);

  return NextResponse.json({
    memberId: member.id,
    masked: maskEmail(email),
  });
}
