import twilio from "twilio";

/**
 * Thin wrapper around Twilio so the rest of the app never touches the
 * SDK directly. Reads credentials lazily so `next build` doesn't need
 * them to succeed.
 */
function getClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error(
      "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not set (see .env.example)."
    );
  }
  return twilio(sid, token);
}

/**
 * True only if an inbound webhook really came from Twilio: Twilio signs
 * every request with your auth token (X-Twilio-Signature). Without this
 * check anyone could POST a fake "From" number and opt a member out or
 * submit songs as them. `url` must be the exact public URL Twilio calls.
 */
export function isValidTwilioRequest(
  signature: string | null,
  url: string,
  params: Record<string, string>
): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  return twilio.validateRequest(token, signature, url, params);
}

export async function sendSms(to: string, body: string) {
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!from) {
    throw new Error("TWILIO_FROM_NUMBER is not set (see .env.example).");
  }
  const client = getClient();
  return client.messages.create({ to, from, body });
}
