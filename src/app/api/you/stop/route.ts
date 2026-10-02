import { NextResponse } from "next/server";
import { getMemberByToken, optOutMember } from "@/lib/members";

/** "Stop texting me" on /you. Token-authorized (no session) — the
 * unguessable token itself is the proof this is the subscriber's own
 * page, same trust model as the magic link they clicked to get here. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = (body as { token?: string } | null)?.token;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const subscriber = await getMemberByToken(token);
  if (!subscriber) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await optOutMember(subscriber.id);
  return NextResponse.json({ ok: true });
}
