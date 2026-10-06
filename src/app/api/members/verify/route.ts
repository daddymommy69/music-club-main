import { NextResponse } from "next/server";
import { getMemberById, verifyLoginCode, verifyCodeFailureMessage } from "@/lib/members";
import { setMemberSession } from "@/lib/memberSession";

/** Step 2 of the unified /account login — mirrors /api/curators/verify, minus the isCurator re-check (any member, not just curators, can land here). */
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
  if (!member) {
    // The code was genuinely right — this only happens if the member
    // row itself vanished between requesting the code and typing it in,
    // which should be effectively impossible. Distinct message so it's
    // never confused with a bad code if it ever does show up.
    return NextResponse.json(
      { error: "Something went wrong on our end — try requesting a new code." },
      { status: 400 }
    );
  }

  await setMemberSession(member.id);
  return NextResponse.json({ ok: true });
}
