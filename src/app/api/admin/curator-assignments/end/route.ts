import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/memberSession";
import { endCuratorAssignmentManual } from "@/lib/curatorAssignments";

/**
 * Admin Tools' "End now" button (2026-11-03 "scoped curator terms"
 * round — see claude/next-build.md) — cuts a single active assignment
 * short, whatever its mode, instead of waiting for its own count/date
 * to run out on its own. Same body-based "id in the JSON, not the URL"
 * shape as /api/admin/pending-curators, and the same admin-session
 * gate as every other admin route here.
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
    await endCuratorAssignmentManual(id!);
  } catch (err) {
    console.error("endCuratorAssignmentManual failed:", err);
    return NextResponse.json({ error: "Couldn't end that. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
