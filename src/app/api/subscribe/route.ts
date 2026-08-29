import { NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { subscribers } from "@/db/schema";
import { getDefaultClub } from "@/lib/club";
import { normalizePhone, normalizeEmail, isUniqueViolation } from "@/lib/normalize";
import { sendSms } from "@/lib/sms";
import { sendEmail } from "@/lib/email";
import { confirmationSmsBody, confirmationEmailHtml } from "@/lib/messages";
import { generateYouToken } from "@/lib/subscriberToken";

/** Indexed lookup on the normalized *Key columns — replaces the old
 * fetch-everyone-and-compare-in-JS scan. */
async function findSubscriberDuplicate(
  clubId: number,
  phoneKey: string | null,
  emailKey: string | null
) {
  if (!phoneKey && !emailKey) return null;
  const db = getDb();
  const matchers = [
    phoneKey ? eq(subscribers.phoneKey, phoneKey) : undefined,
    emailKey ? eq(subscribers.emailKey, emailKey) : undefined,
  ].filter((m): m is NonNullable<typeof m> => !!m);
  const [row] = await db
    .select()
    .from(subscribers)
    .where(and(eq(subscribers.clubId, clubId), or(...matchers)))
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

  // Name is optional per the design handoff — mirrors the client-side
  // validation in SignupForm exactly, since this is the backstop for
  // a request that skips the form (or a client with JS errors).
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

  const db = getDb();
  const club = await getDefaultClub();

  // Duplicate sign-up: match on phone or email within this club and
  // treat it as a no-op rather than a second record or an error.
  const phoneKey = wantsText && phone ? normalizePhone(phone) : null;
  const emailKey = wantsEmail && email ? normalizeEmail(email) : null;

  const existing = await findSubscriberDuplicate(club.id, phoneKey, emailKey);
  if (existing) {
    // Report what's actually on file, not what this submission happened
    // to have checked — a duplicate is a no-op, so if someone's stored
    // preference is text-only and they just tried to sign up for email,
    // telling them "you'll get it by email" would be a real promise this
    // response can't back up.
    return NextResponse.json({
      ok: true,
      id: existing.id,
      duplicate: true,
      wantsText: existing.wantsText,
      wantsEmail: existing.wantsEmail,
    });
  }

  let created;
  try {
    [created] = await db
      .insert(subscribers)
      .values({
        clubId: club.id,
        name: name?.trim() || null,
        phone: wantsText ? phone : null,
        email: wantsEmail ? email : null,
        phoneKey,
        emailKey,
        wantsText: !!wantsText,
        wantsEmail: !!wantsEmail,
        smsConsent: wantsText ? !!smsOptIn : false,
        smsOptInAt: wantsText ? new Date() : null,
        youToken: generateYouToken(),
      })
      .returning();
  } catch (err) {
    // Lost a race with another request signing up the same phone/email
    // between our check above and this insert. Same outcome as a normal
    // duplicate: hand back the row that won.
    if (isUniqueViolation(err)) {
      const dupe = await findSubscriberDuplicate(club.id, phoneKey, emailKey);
      if (dupe) {
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

  // Best-effort confirmation — a failure here shouldn't fail the signup.
  try {
    if (created.wantsText && created.phone) {
      await sendSms(created.phone, confirmationSmsBody());
    }
    if (created.wantsEmail && created.email) {
      await sendEmail(
        created.email,
        "You're in!",
        confirmationEmailHtml()
      );
    }
  } catch (err) {
    console.error("Confirmation send failed:", err);
  }

  return NextResponse.json({ ok: true, id: created.id });
}
