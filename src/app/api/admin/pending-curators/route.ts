import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/memberSession";
import { removePendingCurator } from "@/lib/members";

/**
 * Cancels a pending curator invite before that person has signed up
 * (2026-10-09 — see claude/next-build.md and
 * /api/admin/members/curator's own comment for the grant side). Same
 * admin-session gate as every other admin route here — not the
 * ADMIN_SECRET bearer-token pattern.
 */
export async function DELETE(request: Request) {
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
    await removePendingCurator(id!);
  } catch (err) {
    console.error("removePendingCurator failed:", err);
    return NextResponse.json({ error: "Couldn't cancel that invite. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
