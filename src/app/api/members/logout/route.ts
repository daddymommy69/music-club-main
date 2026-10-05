import { NextResponse } from "next/server";
import { clearMemberSession } from "@/lib/memberSession";

/** Same effect as /api/curators/logout (session is unified — see memberSession.ts) — a separate route purely so /account's logout call reads clearly as a member action, not a curator one. */
export async function POST() {
  await clearMemberSession();
  return NextResponse.json({ ok: true });
}
