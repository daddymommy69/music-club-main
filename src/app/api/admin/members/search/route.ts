import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { searchMembers } from "@/lib/curatorAssignments";

/**
 * Admin Tools' member picker (2026-11-03 "scoped curator terms" round
 * — see claude/next-build.md) — searches by name or email so granting
 * curator status doesn't mean typing someone's exact email blind, the
 * one real complaint about the old /settings panel. Same admin-session
 * gate as every other admin route here.
 */
export async function GET(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q") ?? "";
  const club = await getDefaultClub();
  const results = await searchMembers(club.id, q);

  return NextResponse.json({
    results: results.map((m) => ({ id: m.id, name: m.name, email: m.email, isCurator: m.isCurator })),
  });
}
