import { NextResponse } from "next/server";
import { getDefaultClub } from "@/lib/club";
import { requireAdminSession } from "@/lib/memberSession";
import { findMemberByEmail, getMemberById, addPendingCurator } from "@/lib/members";
import { grantCuratorAssignment, type GrantParams } from "@/lib/curatorAssignments";
import { sendEmail } from "@/lib/email";
import { CURATOR_GRANTED_SUBJECT, curatorInviteEmailHtml } from "@/lib/messages";

/**
 * Grants curator status for a defined stretch of drops, a calendar
 * date, or indefinitely (2026-11-03 "scoped curator terms" round — see
 * claude/next-build.md). Gated on the requester's own logged-in
 * session being a Member with isAdmin true — NOT the ADMIN_SECRET
 * bearer-token pattern /api/drops and /api/admin/spotify-backfill use,
 * since flipping someone's curator status needs a real human identity
 * behind it, not a shared secret.
 *
 * Grant panel lives at /admin (AdminToolsPanel.tsx), which replaced
 * the old permanent on/off toggle this route used to be — the
 * "unlimited" mode below is that same permanent grant, just one option
 * among several now instead of the only one. Ending an active
 * assignment early is a separate route (/api/admin/curator-assignments/
 * [id]/end), since a member can have more than one.
 *
 * curl -X POST https://yoursite/api/admin/members/curator \
 *   -H "Content-Type: application/json" \
 *   -H "Cookie: gz_session=<the admin's own session cookie>" \
 *   -d '{"memberId": 12, "mode": "count", "count": 3}'
 *
 * Pending invites (an email with no member yet — 2026-10-09, see
 * claude/next-build.md) only ever support "unlimited": the other modes
 * need a real member row to attach a count/date/drop-list to, and
 * there's no sign a founder ever wants a scoped grant to kick in sight
 * unseen for someone who hasn't even signed up. Canceling a still-
 * pending invite goes through /api/admin/pending-curators instead.
 */
export async function POST(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { memberId, email, mode, count, endDate, dropNums } = (body ?? {}) as {
    memberId?: number;
    email?: string;
    mode?: string;
    count?: number;
    endDate?: string;
    dropNums?: number[];
  };

  if (mode !== "count" && mode !== "date" && mode !== "drops" && mode !== "unlimited") {
    return NextResponse.json({ error: "mode must be count, date, drops, or unlimited" }, { status: 400 });
  }

  let params: GrantParams;
  if (mode === "count") {
    if (!Number.isInteger(count) || count! < 1) {
      return NextResponse.json({ error: "count must be a whole number of at least 1" }, { status: 400 });
    }
    params = { mode: "count", count: count! };
  } else if (mode === "date") {
    const parsed = endDate ? new Date(endDate) : null;
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed <= new Date()) {
      return NextResponse.json({ error: "endDate must be a valid date in the future" }, { status: 400 });
    }
    params = { mode: "date", endDate: parsed };
  } else if (mode === "drops") {
    const nums = Array.isArray(dropNums) ? dropNums.filter((n) => Number.isInteger(n) && n > 0) : [];
    if (nums.length === 0) {
      return NextResponse.json({ error: "dropNums must list at least one drop number" }, { status: 400 });
    }
    params = { mode: "drops", dropNums: nums };
  } else {
    params = { mode: "unlimited" };
  }

  const club = await getDefaultClub();
  const member = memberId ? await getMemberById(memberId) : email ? await findMemberByEmail(club, email) : null;

  if (!member) {
    if (mode !== "unlimited" || !email?.trim()) {
      return NextResponse.json(
        { error: "No member found. Scoped grants (drop count, date, specific drops) need an existing member — search for them above." },
        { status: 404 }
      );
    }
    try {
      const added = await addPendingCurator(club, email, admin.name || admin.email || "An admin");
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
    const assignment = await grantCuratorAssignment(club, member, params, admin.name || admin.email || "An admin");
    return NextResponse.json({
      ok: true,
      id: member.id,
      name: member.name,
      email: member.email,
      assignment: { id: assignment.id, mode: assignment.mode },
    });
  } catch (err) {
    console.error("grantCuratorAssignment failed:", err);
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  }
}
