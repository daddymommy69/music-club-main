import { NextResponse } from "next/server";
import { getDefaultClub } from "@/lib/club";
import { requireAdminSession } from "@/lib/memberSession";
import { findMemberByEmail, setCuratorStatus, addPendingCurator } from "@/lib/members";
import { sendEmail } from "@/lib/email";
import { CURATOR_GRANTED_SUBJECT, curatorGrantedEmailHtml, curatorInviteEmailHtml } from "@/lib/messages";

/**
 * Grants or revokes curator status for a member. Gated on the
 * requester's own logged-in session being a Member with isAdmin true —
 * NOT the ADMIN_SECRET bearer-token pattern /api/drops and
 * /api/admin/spotify-backfill use, since flipping someone's curator
 * status needs a real human identity behind it, not a shared secret.
 *
 * Grant-by-email panel lives in /settings (AdminSection in
 * SettingsBoard.tsx) — this route is what it posts to.
 *
 * curl -X POST https://yoursite/api/admin/members/curator \
 *   -H "Content-Type: application/json" \
 *   -H "Cookie: gz_session=<the admin's own session cookie>" \
 *   -d '{"email": "someone@example.com", "isCurator": true}'
 *
 * 2026-10-09 (see claude/next-build.md — the founder's own "i type an
 * email and when they sign up they are a curator"): granting an email
 * with no member yet no longer 404s. It falls through to a pending
 * invite instead (addPendingCurator/members.ts's findOrCreateMember),
 * consumed automatically the moment that email actually signs up.
 * Revoking still requires a real existing member — there's nothing to
 * revoke for an email that was never granted, pending or otherwise;
 * canceling a still-pending invite goes through
 * /api/admin/pending-curators instead (see SettingsBoard.tsx).
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
    if (!isCurator) {
      return NextResponse.json({ error: "No member found for that email" }, { status: 404 });
    }
    try {
      const added = await addPendingCurator(club, email, admin.name || admin.email || "An admin");
      // Best-effort "go sign up" nudge — 2026-10-09 follow-up (see
      // claude/next-build.md): a pending invite used to sit completely
      // silent until the invited person happened to sign up on their
      // own, with nothing ever telling them an invite existed. Same
      // email/wording as the real grant (the founder's own call —
      // "we made it together, use that one"), just pointed at /signup
      // since /curators itself refuses anyone with no member row yet.
      // Never blocks the invite save on a delivery failure, same
      // pattern as every other sendEmail call here.
      try {
        await sendEmail(added.email, CURATOR_GRANTED_SUBJECT, curatorInviteEmailHtml());
      } catch (err) {
        console.error("Curator-invite email failed (invite still saved):", err);
      }
      return NextResponse.json({ ok: true, pending: true, pendingId: added.id, email: added.email });
    } catch (err) {
      console.error("addPendingCurator failed:", err);
      return NextResponse.json({ error: "Couldn't save that invite. Try again." }, { status: 500 });
    }
  }

  try {
    await setCuratorStatus(member.id, isCurator);
  } catch (err) {
    console.error("setCuratorStatus failed:", err);
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  }

  // Best-effort "you're a chosen one" notification — only on a grant,
  // never a revoke. Mirrors every other sendEmail call in this app:
  // never blocks the actual grant on a delivery failure, just logs it.
  if (isCurator && member.email) {
    try {
      await sendEmail(member.email, CURATOR_GRANTED_SUBJECT, curatorGrantedEmailHtml());
    } catch (err) {
      console.error("Curator-granted email failed (grant still applied):", err);
    }
  }

  return NextResponse.json({ ok: true, id: member.id, name: member.name, isCurator });
}
