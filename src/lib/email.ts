import { Resend } from "resend";

function getClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set (see .env.example).");
  }
  return new Resend(apiKey);
}

export async function sendEmail(to: string, subject: string, html: string) {
  const from = process.env.EMAIL_FROM_ADDRESS;
  if (!from) {
    throw new Error("EMAIL_FROM_ADDRESS is not set (see .env.example).");
  }
  const client = getClient();
  const result = await client.emails.send({ from, to, subject, html });
  // Resend's SDK does NOT throw on an API-level failure (bad key,
  // unverified domain, rate limit) — it resolves normally with
  // `{ data: null, error }`. Every caller wraps this call in a plain
  // try/catch expecting a thrown error on failure, so without this
  // check a real send failure looked identical to success: no log,
  // no thrown exception, the "code"/"release" just silently never
  // arrived (2026-10-06 QA sweep finding).
  if (result.error) {
    throw new Error(`Resend failed to send to ${to}: ${result.error.message ?? JSON.stringify(result.error)}`);
  }
  return result;
}
