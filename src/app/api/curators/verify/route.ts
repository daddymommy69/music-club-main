import { NextResponse } from "next/server";
import { getMemberById, verifyLoginCode, verifyCodeFailureMessage } from "@/lib/members";
import { setMemberSession } from "@/lib/memberSession";

/** Step 2 of curator login: check the six-digit code, then re-check
 * isCurator before setting the session — a member's curator status
 * could in principle be revoked in the narrow window between lookup
 * (step 1) and this verify call, so this doesn't just trust step 1. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { memberId, code } = (body ?? {}) as { memberId?: number; code?: string };

  if (!memberId || !code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Enter all 6 digits" }, { status: 400 });
  }

  const result = await verifyLoginCode(memberId, code);
  if (!result.ok) {
    return NextResponse.json({ error: verifyCodeFailureMessage(result.reason) }, { status: 400 });
  }

  const member = await getMemberById(memberId);
  if (!member || !member.isCurator) {
    // Distinct from a bad code on purpose (2026-10-06 QA sweep follow-up
    // — see claude/next-build.md): the code was genuinely right, so
    // telling someone "that code isn't right" here would send them
    // chasing the wrong problem. This only happens if curator status was
    // revoked in the few seconds between requesting the code and typing
    // it in — rare, but a real, different failure.
    return NextResponse.json(
      { error: "That code was right, but you're not set up as a curator anymore — ask an admin." },
      { status: 400 }
    );
  }

  await setMemberSession(member.id);
  return NextResponse.json({ ok: true });
}
