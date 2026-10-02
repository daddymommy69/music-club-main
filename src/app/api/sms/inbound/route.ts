import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { members } from "@/db/schema";
import { getDefaultClub } from "@/lib/club";
import { normalizePhone } from "@/lib/normalize";
import { handleInboundSongText } from "@/lib/smsSubmit";

/**
 * Twilio calls this (as form-encoded POST data) for every inbound text
 * to your number. Twilio itself already auto-blocks further sends after
 * a STOP if you're on a Messaging Service with Advanced Opt-Out — this
 * additionally marks the subscriber opted_out in our own database so
 * the UI/exports reflect it too, and handles START to undo it.
 *
 * Anything else is SMS text-in (Phase 1, built 2026-08-29): a Spotify or
 * Apple Music link gets treated as a /submit entry — see
 * src/lib/smsSubmit.ts for the actual logic. Unlike STOP/START, this
 * path replies with real TwiML content, since it's meant to be a live
 * back-and-forth rather than a silent status flip.
 *
 * Set this URL as the "A message comes in" webhook on your Twilio
 * number: https://yoursite/api/sms/inbound
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const from = formData.get("From")?.toString();
  const rawBody = formData.get("Body")?.toString() ?? "";
  const bodyUpper = rawBody.trim().toUpperCase();

  if (!from || !rawBody.trim()) {
    return twiml();
  }

  // Matched by the same normalized phoneKey every other lookup in this
  // app uses (src/lib/normalize.ts) — matching the raw `phone` column
  // directly (the old version of this file) silently never matches
  // whenever a subscriber's stored format differs at all from Twilio's
  // strict E.164 `From` (e.g. a stray space or missing "+" from however
  // it was typed at signup), the same class of bug isUniqueViolation()
  // turned out to have elsewhere in this app.
  const phoneKey = normalizePhone(from);
  const db = getDb();

  if (bodyUpper === "STOP") {
    await db.update(members).set({ optedOut: true }).where(eq(members.phoneKey, phoneKey));
    return twiml();
  }
  if (bodyUpper === "START") {
    await db.update(members).set({ optedOut: false }).where(eq(members.phoneKey, phoneKey));
    return twiml();
  }

  const club = await getDefaultClub();
  const reply = await handleInboundSongText(club, from, rawBody);
  return twiml(reply);
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Empty (no `<Message>`) = no auto-reply beyond Twilio's own built-in
 * STOP/START confirmation, used for both of those. Anything else gets a
 * real reply texted back. */
function twiml(message?: string): NextResponse {
  const body = message ? `<Response><Message>${escapeXml(message)}</Message></Response>` : `<Response></Response>`;
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    headers: { "Content-Type": "text/xml" },
  });
}
