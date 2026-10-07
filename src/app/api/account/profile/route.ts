import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/memberSession";
import { updateMemberProfile } from "@/lib/memberProfile";

/** Updates the signed-in member's profile — name and/or bio. Either field is optional so a caller can send just one; omitting a field leaves it untouched. */
export async function POST(request: Request) {
  const member = await requireMemberSession();
  if (!member) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { name, bio } = (body ?? {}) as { name?: unknown; bio?: unknown };

  if (name !== undefined && typeof name !== "string") {
    return NextResponse.json({ error: "name must be a string" }, { status: 400 });
  }
  if (bio !== undefined && typeof bio !== "string") {
    return NextResponse.json({ error: "bio must be a string" }, { status: 400 });
  }

  await updateMemberProfile(member.id, {
    ...(name !== undefined ? { name: name as string } : {}),
    ...(bio !== undefined ? { bio: bio as string } : {}),
  });
  return NextResponse.json({ ok: true });
}
