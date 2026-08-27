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
  return client.emails.send({ from, to, subject, html });
}
