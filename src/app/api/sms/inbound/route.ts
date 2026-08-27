import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { subscribers } from "@/db/schema";

/**
 * Twilio calls this (as form-encoded POST data) for every inbound text
 * to your number. Twilio itself already auto-blocks further sends after
 * a STOP if you're on a Messaging Service with Advanced Opt-Out — this
 * additionally marks the subscriber opted_out in our own database so
 * the UI/exports reflect it too, and handles START to undo it.
 *
 * Set this URL as the "A message comes in" webhook on your Twilio
 * number: https://yoursite/api/sms/inbound
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const from = formData.get("From")?.toString();
  const bodyText = formData.get("Body")?.toString().trim().toUpperCase();

  if (from && bodyText) {
    const db = getDb();
    if (bodyText === "STOP") {
      await db
        .update(subscribers)
        .set({ optedOut: true })
        .where(eq(subscribers.phone, from));
    } else if (bodyText === "START") {
      await db
        .update(subscribers)
        .set({ optedOut: false })
        .where(eq(subscribers.phone, from));
    }
    // Anything else (e.g. a song link texted in) is a Phase 1 feature —
    // not handled yet in this Phase 0 build.
  }

  // Empty TwiML response = no auto-reply beyond Twilio's own STOP/START confirmation.
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    { headers: { "Content-Type": "text/xml" } }
  );
}
