import { NextResponse } from "next/server";
import { getMemberById, verifyLoginCode } from "@/lib/members";
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

  const ok = await verifyLoginCode(memberId, code);
  if (!ok) {
    return NextResponse.json({ error: "That code isn't right" }, { status: 400 });
  }

  const member = await getMemberById(memberId);
  if (!member || !member.isCurator) {
    return NextResponse.json({ error: "That code isn't right" }, { status: 400 });
  }

  await setMemberSession(member.id);
  return NextResponse.json({ ok: true });
}
