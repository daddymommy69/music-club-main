import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/memberSession";
import { updateMemberBio } from "@/lib/memberProfile";

/** Updates the signed-in member's profile bio. */
export async function POST(request: Request) {
  const member = await requireMemberSession();
  if (!member) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const bio = (body as { bio?: string } | null)?.bio ?? "";
  if (typeof bio !== "string") {
    return NextResponse.json({ error: "bio must be a string" }, { status: 400 });
  }

  await updateMemberBio(member.id, bio);
  return NextResponse.json({ ok: true });
}
