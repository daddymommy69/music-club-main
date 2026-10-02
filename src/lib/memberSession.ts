import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getMemberById } from "./members";
import type { Member } from "@/db/schema";

const COOKIE_NAME = "gz_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days — a low-stakes club login, not a bank.

/**
 * Unified session (2026-10 decision — see claude/next-build.md).
 * Replaces the old curator-only curatorSession.ts — every member now
 * gets the same session mechanism, curator or not; `isCurator` on the
 * loaded Member row is what gates curator-only UI/routes, not a
 * separate cookie or separate login system.
 */

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
 * A minimal signed cookie — memberId + issue time + HMAC — rather than
 * a full auth library. No passwords are stored anywhere, so there's
 * nothing here worth a heavier dependency: this cookie just proves
 * "this browser completed login for member N" (either the six-digit
 * email code, or clicking their memberToken magic link).
 */
export function encodeSession(memberId: number): string {
  const payload = `${memberId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string): { memberId: number } | null {
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

  const memberId = Number(idStr);
  if (!Number.isInteger(memberId)) return null;

  // The signature only proves the token wasn't tampered with — it says
  // nothing about age. Without this check a copied/leaked token would
  // stay valid forever server-side; MAX_AGE_SECONDS on the cookie itself
  // is just a hint to the browser to drop it, not something the server
  // re-checks unless we do it here.
  const issuedAt = Number(tsStr);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > MAX_AGE_SECONDS * 1000) {
    return null;
  }

  return { memberId };
}

export async function setMemberSession(memberId: number) {
  const store = await cookies();
  store.set(COOKIE_NAME, encodeSession(memberId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function clearMemberSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Reads and verifies the session cookie for the current request. Returns null if absent or invalid. */
export async function getSessionMemberId(): Promise<number | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const decoded = decodeSession(token);
  return decoded?.memberId ?? null;
}

/** Convenience wrapper most pages/routes want: the full Member row (or null), one call. */
export async function getSessionMember(): Promise<Member | null> {
  const id = await getSessionMemberId();
  if (id === null) return null;
  return getMemberById(id);
}

/**
 * For admin-only routes (e.g. the curator-grant endpoint) that need a
 * real logged-in human, not the shared-secret ADMIN_SECRET bearer-token
 * pattern used by /api/drops and friends (see src/lib/adminAuth.ts).
 * Returns the Member when they're logged in AND isAdmin — null for
 * either "not logged in" or "logged in but not an admin", same as every
 * other session helper in this file; the caller shapes the 401 response
 * the same way the rest of this app's routes already do.
 */
export async function requireAdminSession(): Promise<Member | null> {
  const member = await getSessionMember();
  if (!member || !member.isAdmin) return null;
  return member;
}
