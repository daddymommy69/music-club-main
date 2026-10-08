import { NextResponse } from "next/server";
import { getSessionMember } from "@/lib/memberSession";
import { disconnectMemberSpotify } from "@/lib/visitorSpotify";

export async function POST() {
  const member = await getSessionMember();
  if (!member) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  await disconnectMemberSpotify(member.id);
  return NextResponse.json({ ok: true });
}
