import { randomBytes } from "crypto";

/**
 * Unguessable per-subscriber token for the magic-link /you page —
 * base64url, 24 random bytes (192 bits), so it's not worth trying to
 * enumerate. Deliberately not derived from the subscriber's id/phone/
 * email — nothing about the token should leak identity.
 */
export function generateYouToken(): string {
  return randomBytes(24).toString("base64url");
}
