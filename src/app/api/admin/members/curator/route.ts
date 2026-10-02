import { NextResponse } from "next/server";
import { getDefaultClub } from "@/lib/club";
import { requireAdminSession } from "@/lib/memberSession";
import { findMemberByEmail, setCuratorStatus } from "@/lib/members";

/**
 * Grants or revokes curator status for a member. Gated on the
 * requester's own logged-in session being a Member with isAdmin true —
 * NOT the ADMIN_SECRET bearer-token pattern /api/drops and
 * /api/admin/spotify-backfill use, since flipping someone's curator
 * status needs a real human identity behind it, not a shared secret.
 * There's no admin UI for this yet (see claude/next-build.md) — call it
 * directly, same spirit as this app's other admin-only routes:
 *
 * curl -X POST https://yoursite/api/admin/members/curator \
 *   -H "Content-Type: application/json" \
 *   -H "Cookie: gz_session=<the admin's own session cookie>" \
 *   -d '{"email": "someone@example.com", "isCurator": true}'
 */
export async function POST(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { email, isCurator } = (body ?? {}) as { email?: string; isCurator?: boolean };

  if (!email || !email.trim()) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  if (typeof isCurator !== "boolean") {
    return NextResponse.json({ error: "isCurator (boolean) required" }, { status: 400 });
  }

  const club = await getDefaultClub();
  const member = await findMemberByEmail(club, email);
  if (!member) {
    return NextResponse.json({ error: "No member found for that email" }, { status: 404 });
  }

  await setCuratorStatus(member.id, isCurator);

  return NextResponse.json({ ok: true, id: member.id, isCurator });
}
