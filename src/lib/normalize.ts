/**
 * Canonical dedupe-key form for phone/email — used both when comparing
 * ("is this the same person") and when writing the *Key columns that
 * carry a real DB unique constraint (src/db/schema.ts). Keeping this in
 * one place means the constraint and the app-layer comparisons can never
 * drift apart.
 *
 * The user-facing `phone`/`email` columns keep whatever the person typed
 * (needed to actually place the call to Twilio/Resend); only the *Key
 * columns are normalized.
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Canonical grouping key for a free-text artist name (2026-10-07
 * "Browse" round — see claude/next-build.md). songs.artist has no real
 * FK/entity behind it — every artist page, the Browse directory, and
 * the Spotify-photo cache all group songs by this same trim+lowercase
 * key rather than the raw text, so "Tame Impala" and "tame impala " are
 * treated as the same artist. Known, accepted limitation (founder's own
 * call): two differently-spelled or differently-cased entries for what
 * is actually the same artist won't merge, and two different real-world
 * artists who happen to share an exact name will.
 */
export function normalizeArtistName(artist: string): string {
  return artist.trim().toLowerCase();
}

/**
 * True if `err` is a Postgres unique-constraint violation (SQLSTATE
 * 23505). Checks both `err.code` and `err.cause.code` — drizzle-orm
 * wraps the raw postgres-js error in its own `DrizzleQueryError`, which
 * puts the real error (and its `code`) on `.cause` rather than exposing
 * it directly. Every "insert and catch the race" path in this app
 * (subscriber/curator signup, and Top 10) relies on this to detect a
 * violation and recover — checking only the top-level `.code` silently
 * never matched here, so every one of those recovery paths was actually
 * falling through to an unhandled 500 instead. Found via a real Top 10
 * duplicate-submission test that crashed instead of returning the
 * expected "already submitted" response.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: string }).code;
  if (code === "23505") return true;
  const cause = (err as { cause?: unknown }).cause;
  return typeof cause === "object" && cause !== null && (cause as { code?: string }).code === "23505";
}
