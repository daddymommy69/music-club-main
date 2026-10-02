import { randomBytes } from "crypto";

/**
 * Unguessable per-member token for the magic link into the unified
 * account page — every release text/email, and the post-signup
 * confirmation, uses this so clicking it signs you in immediately, no
 * code needed (see src/app/m/[token]/route.ts, which exchanges this for
 * a real session cookie). Base64url, 24 random bytes (192 bits), so
 * it's not worth trying to enumerate. Deliberately not derived from the
 * member's id/phone/email — nothing about the token should leak
 * identity. Replaces the old subscriber-only youToken; every member
 * gets one now, curators included.
 */
export function generateMemberToken(): string {
  return randomBytes(24).toString("base64url");
}
