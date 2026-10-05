import { NextResponse } from "next/server";
import { getMemberById, verifyLoginCode } from "@/lib/members";
import { setMemberSession } from "@/lib/memberSession";

/** Step 2 of the unified /account login — mirrors /api/curators/verify, minus the isCurator re-check (any member, not just curators, can land here). */
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
  if (!member) {
    return NextResponse.json({ error: "That code isn't right" }, { status: 400 });
  }

  await setMemberSession(member.id);
  return NextResponse.json({ ok: true });
}
