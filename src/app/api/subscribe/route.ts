import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { subscribers } from "@/db/schema";
import { sendSms } from "@/lib/sms";
import { sendEmail } from "@/lib/email";
import { confirmationSmsBody, confirmationEmailHtml } from "@/lib/messages";

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

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!wantsText && !wantsEmail) {
    return NextResponse.json(
      { error: "Pick at least one of text or email" },
      { status: 400 }
    );
  }
  if (wantsText && !phone) {
    return NextResponse.json(
      { error: "Phone number is required for text updates" },
      { status: 400 }
    );
  }
  if (wantsText && !smsOptIn) {
    return NextResponse.json(
      { error: "You must agree to receive texts to sign up for SMS" },
      { status: 400 }
    );
  }
  if (wantsEmail && !email) {
    return NextResponse.json(
      { error: "Email is required for email updates" },
      { status: 400 }
    );
  }

  const db = getDb();
  const [created] = await db
    .insert(subscribers)
    .values({
      name: name.trim(),
      phone: wantsText ? phone : null,
      email: wantsEmail ? email : null,
      wantsText: !!wantsText,
      wantsEmail: !!wantsEmail,
      smsOptInAt: wantsText ? new Date() : null,
    })
    .returning();

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
