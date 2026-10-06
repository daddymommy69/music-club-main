import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { members } from "@/db/schema";
import { getDefaultClub } from "@/lib/club";
import { findMemberByEmail, findOrCreateMember } from "@/lib/members";
import { setMemberSession } from "@/lib/memberSession";
import { generateMemberToken } from "@/lib/memberToken";
import { normalizePhone, isUniqueViolation } from "@/lib/normalize";
import { sendSms } from "@/lib/sms";
import { sendEmail } from "@/lib/email";
import { confirmationSmsBody, confirmationEmailHtml } from "@/lib/messages";

/** Indexed lookup on the normalized phoneKey column — for the
 * phone-only (no email) signup path, see the comment below. */
async function findMemberByPhone(clubId: number, phoneKey: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(members)
    .where(and(eq(members.clubId, clubId), eq(members.phoneKey, phoneKey)))
    .limit(1);
  return row ?? null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, phone, email, wantsText, wantsEmail, smsOptIn } = body as {
    name?: string;
    phone?: string;
    email?: string;
    wantsText?: boolean;
    wantsEmail?: boolean;
    smsOptIn?: boolean;
  };

  // Name is optional per the design handoff. This whole route predates
  // the unified-account /account page (AccountAuth posts to
  // /api/members/lookup + /api/members/verify instead) and is kept only
  // for the SMS text-in path (src/lib/smsSubmit.ts) — see
  // claude/next-build.md's 2026-10 release-page redesign notes.
  if (!wantsText && !wantsEmail) {
    return NextResponse.json({ error: "Pick text, email, or both" }, { status: 400 });
  }
  if (wantsText) {
    const digits = (phone ?? "").replace(/\D/g, "");
    if (!phone || !phone.trim()) {
      return NextResponse.json(
        { error: "Phone number is required for text updates" },
        { status: 400 }
      );
    }
    if (digits.length < 10) {
      return NextResponse.json(
        { error: "That doesn't look like a full phone number" },
        { status: 400 }
      );
    }
    if (!smsOptIn) {
      return NextResponse.json(
        { error: "Please agree before we can text you" },
        { status: 400 }
      );
    }
  }
  if (wantsEmail) {
    if (!email || !email.trim()) {
      return NextResponse.json(
        { error: "Email address is required for email updates" },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json(
        { error: "Check that address — it's missing something" },
        { status: 400 }
      );
    }
  }

  const club = await getDefaultClub();

  // Unified account model: a Member's identity key is email
  // (findOrCreateMember/findMemberByEmail in members.ts only dedupe by
  // email — it's the login identity now).
  if (wantsEmail && email && email.trim()) {
    const existing = await findMemberByEmail(club, email);
    if (existing) {
      // Deliberately NOT calling setMemberSession here (found 2026-10-05,
      // during the next-build session, while auditing how /account's new
      // signup-or-login route proves identity): this is a public,
      // unauthenticated form, so "I typed an email that happens to match
      // an existing member" is not proof it's actually that member —
      // logging them in on the strength of a bare re-submitted email would
      // let anyone who knows another member's address take over their
      // session. Report what's actually on file (same as before), just
      // without the free login. Returning members who want back in use
      // /account's emailed-code flow instead, same as curators always have.
      return NextResponse.json({
        ok: true,
        id: existing.id,
        duplicate: true,
        wantsText: existing.wantsText,
        wantsEmail: existing.wantsEmail,
      });
    }

    const created = await findOrCreateMember(club, {
      name,
      email: email.trim(),
      phone: wantsText ? phone : null,
      wantsText: !!wantsText,
      wantsEmail: !!wantsEmail,
      smsConsent: wantsText ? !!smsOptIn : false,
    });

    // New behavior (intentional, per the unified account model): signing
    // up now also logs you in immediately — no separate login step.
    await setMemberSession(created.id);

    // Best-effort confirmation — a failure here shouldn't fail the signup.
    try {
      if (created.wantsText && created.phone) {
        await sendSms(created.phone, confirmationSmsBody());
      }
      if (created.wantsEmail && created.email) {
        await sendEmail(created.email, "You're in!", confirmationEmailHtml());
      }
    } catch (err) {
      console.error("Confirmation send failed:", err);
    }

    return NextResponse.json({ ok: true, id: created.id });
  }

  // Phone-only (no email) signup. findOrCreateMember requires an email —
  // by design, it's the member's unified-account login identity — so
  // this legacy text-only path (SMS text-in only; /account's web signup
  // has no phone option) talks to `members` directly, same phoneKey
  // dedupe-and-insert the old subscribers-table code did.
  const phoneKey = normalizePhone(phone as string);
  const existingByPhone = await findMemberByPhone(club.id, phoneKey);
  if (existingByPhone) {
    // Same reasoning as the email duplicate branch above — a bare phone
    // number on an unauthenticated form isn't proof of identity either.
    return NextResponse.json({
      ok: true,
      id: existingByPhone.id,
      duplicate: true,
      wantsText: existingByPhone.wantsText,
      wantsEmail: existingByPhone.wantsEmail,
    });
  }

  const db = getDb();
  let created;
  try {
    [created] = await db
      .insert(members)
      .values({
        clubId: club.id,
        name: name?.trim() || null,
        phone: phone as string,
        phoneKey,
        wantsText: true,
        wantsEmail: false,
        smsConsent: !!smsOptIn,
        smsOptInAt: new Date(),
        memberToken: generateMemberToken(),
      })
      .returning();
  } catch (err) {
    // Lost a race with another request signing up the same phone
    // between our check above and this insert. Same outcome as a normal
    // duplicate: hand back the row that won.
    if (isUniqueViolation(err)) {
      const dupe = await findMemberByPhone(club.id, phoneKey);
      if (dupe) {
        await setMemberSession(dupe.id);
        return NextResponse.json({
          ok: true,
          id: dupe.id,
          duplicate: true,
          wantsText: dupe.wantsText,
          wantsEmail: dupe.wantsEmail,
        });
      }
    }
    throw err;
  }

  await setMemberSession(created.id);

  try {
    if (created.wantsText && created.phone) {
      await sendSms(created.phone, confirmationSmsBody());
    }
  } catch (err) {
    console.error("Confirmation send failed:", err);
  }

  return NextResponse.json({ ok: true, id: created.id });
}
