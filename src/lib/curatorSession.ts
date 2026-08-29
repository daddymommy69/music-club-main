import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "gz_curator";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days — a low-stakes private-room login, not a bank.

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set (see .env.example).");
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("hex");
}

/**
 * A minimal signed cookie — curatorId + issue time + HMAC — rather than
 * a full auth library. No passwords are stored anywhere, so there's
 * nothing here worth a heavier dependency: this cookie just proves
 * "this browser completed the six-digit code check for curator N."
 */
export function encodeSession(curatorId: number): string {
  const payload = `${curatorId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string): { curatorId: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [idStr, tsStr, sig] = parts;
  const payload = `${idStr}.${tsStr}`;
  const expected = sign(payload);

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  const curatorId = Number(idStr);
  if (!Number.isInteger(curatorId)) return null;

  // The signature only proves the token wasn't tampered with — it says
  // nothing about age. Without this check a copied/leaked token would
  // stay valid forever server-side; MAX_AGE_SECONDS on the cookie itself
  // is just a hint to the browser to drop it, not something the server
  // re-checks unless we do it here.
  const issuedAt = Number(tsStr);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > MAX_AGE_SECONDS * 1000) {
    return null;
  }

  return { curatorId };
}

export async function setCuratorSession(curatorId: number) {
  const store = await cookies();
  store.set(COOKIE_NAME, encodeSession(curatorId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function clearCuratorSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Reads and verifies the session cookie for the current request. Returns null if absent or invalid. */
export async function getSessionCuratorId(): Promise<number | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const decoded = decodeSession(token);
  return decoded?.curatorId ?? null;
}
