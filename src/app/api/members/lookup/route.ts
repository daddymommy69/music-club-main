import { NextResponse } from "next/server";
import { getDefaultClub } from "@/lib/club";
import { findMemberByEmail, findOrCreateMember, issueLoginCode, maskEmail } from "@/lib/members";
import { setMemberSession } from "@/lib/memberSession";

/**
 * Step 1 of the unified /account signup-or-login (2026-10 "next build"
 * decision — see claude/next-build.md). Unlike /api/curators/lookup
 * (which this is modeled closely on), there's no isCurator gate — any
 * email works — AND this one doubles as signup: an email with no
 * existing member is created on the spot and logged straight in, no
 * code needed.
 *
 * Judgment call, documented here since the build spec left the exact
 * shape to our discretion: signing up stays exactly as lightweight as
 * it is today (name + email, no password, no code) — that's what
 * "trust-on-signup" already means for /api/subscribe, so a brand-new
 * /account visitor gets the same deal. An EXISTING member who isn't
 * currently logged in still has to prove it via the emailed code,
 * same as curators do today — that's the real security boundary this
 * app has (a bare email claiming to be an existing member must not be
 * enough to get their session).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { email, name } = (body ?? {}) as { email?: string; name?: string };

  if (!email || !email.trim()) {
    return NextResponse.json({ error: "Enter your email" }, { status: 400 });
  }

  const club = await getDefaultClub();
  const existing = await findMemberByEmail(club, email);

  if (existing) {
    await issueLoginCode(existing);
    return NextResponse.json({
      mode: "code" as const,
      memberId: existing.id,
      masked: maskEmail(email),
    });
  }

  const created = await findOrCreateMember(club, {
    name: name?.trim() || null,
    email,
    wantsEmail: true,
  });
  await setMemberSession(created.id);
  return NextResponse.json({ mode: "created" as const, ok: true });
}
