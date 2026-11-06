import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/memberSession";
import { resendPendingCuratorInvite } from "@/lib/members";

/**
 * Re-sends the "you're a chosen one" invite email for a pending curator
 * invite that's already saved, with no change to its terms — the admin
 * panel's "Resend" link next to "Cancel" on a pending row (2026-11-06,
 * see claude/next-build.md and resendPendingCuratorInvite's own
 * comment in members.ts). Same admin-session gate as every other admin
 * route here.
 *
 * Deliberately a separate route from the "/" DELETE above rather than
 * another method on it — this one's a POST (it has a side effect,
 * sending an email, not just deleting a row) and its own 404 for "that
 * invite's gone" is worth keeping distinct from DELETE's.
 */
export async function POST(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { id } = (body ?? {}) as { id?: number };
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id (integer) required" }, { status: 400 });
  }

  try {
    const { email } = await resendPendingCuratorInvite(id!);
    return NextResponse.json({ ok: true, email });
  } catch (err) {
    console.error("resendPendingCuratorInvite failed:", err);
    const message = err instanceof Error ? err.message : "Couldn't resend that invite. Try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
