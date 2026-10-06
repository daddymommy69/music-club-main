import { randomInt } from "crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { members, loginCodes, type Club, type Member } from "@/db/schema";
import { normalizePhone, normalizeEmail, isUniqueViolation } from "./normalize";
import { sendEmail } from "./email";
import { generateMemberToken } from "./memberToken";

const CODE_TTL_MINUTES = 10;

/**
 * Unified account model (2026-10 decision — see claude/next-build.md).
 * Replaces the old curators.ts + subscribers.ts, which were entirely
 * separate with no cross-table dedupe. Everyone — curator or not — is a
 * `Member` row now; `isCurator` is what used to be "which table."
 *
 * Login moved from a curator-only phone/email code to an email-only
 * one-time code for everyone (founder's call: codes by email, not SMS —
 * keeps Twilio out of the login path, texts stay for drop releases
 * only). A member can still land already signed in via the magic
 * `memberToken` link every release text/email carries — see
 * src/lib/memberToken.ts — so the emailed-code flow below is only for
 * someone navigating to the site directly rather than clicking a link.
 */

export async function findMemberByEmail(club: Club, email: string): Promise<Member | null> {
  const db = getDb();
  const target = normalizeEmail(email);
  const [row] = await db
    .select()
    .from(members)
    .where(and(eq(members.clubId, club.id), eq(members.emailKey, target)))
    .limit(1);
  return row ?? null;
}

export async function getMemberById(id: number): Promise<Member | null> {
  const db = getDb();
  const [row] = await db.select().from(members).where(eq(members.id, id)).limit(1);
  return row ?? null;
}

/** Looks up a member by their magic-link `memberToken` — same lookup the
 * old subscribers.ts did for `youToken`, now unified across every
 * member. Used by /you/[token] and its API routes; no club scoping
 * needed here since the token itself is already globally unique. */
export async function getMemberByToken(token: string): Promise<Member | null> {
  if (!token) return null;
  const db = getDb();
  const [row] = await db.select().from(members).where(eq(members.memberToken, token)).limit(1);
  return row ?? null;
}

/** "Stop texting me" on /you — same effect as replying STOP, minus the
 * phone-number matching (we already know exactly who this is via the
 * token), so it also works for email-only members. */
export async function optOutMember(id: number): Promise<void> {
  const db = getDb();
  await db.update(members).set({ optedOut: true }).where(eq(members.id, id));
}

export type NewMemberInput = {
  name?: string | null;
  email: string;
  phone?: string | null;
  wantsText?: boolean;
  wantsEmail?: boolean;
  smsConsent?: boolean;
};

/**
 * Creates a member if one doesn't already exist for this email within
 * the club, otherwise returns the existing row untouched — signup is
 * idempotent by design (re-submitting the sign-up form is a no-op, same
 * as it always was for subscribers). Email is required now (it's the
 * login identity); phone stays optional, same as before, for whoever
 * also wants texts.
 */
export async function findOrCreateMember(club: Club, input: NewMemberInput): Promise<Member> {
  const db = getDb();
  const existing = await findMemberByEmail(club, input.email);
  if (existing) return existing;

  try {
    const [created] = await db
      .insert(members)
      .values({
        clubId: club.id,
        name: input.name?.trim() || null,
        email: input.email.trim(),
        emailKey: normalizeEmail(input.email),
        phone: input.phone?.trim() || null,
        phoneKey: input.phone ? normalizePhone(input.phone) : null,
        wantsText: input.wantsText ?? false,
        wantsEmail: input.wantsEmail ?? true,
        smsConsent: input.smsConsent ?? false,
        smsOptInAt: input.smsConsent ? new Date() : null,
        memberToken: generateMemberToken(),
      })
      .returning();
    return created;
  } catch (err) {
    // Lost a race with another request creating the same member between
    // our lookup and this insert — the unique constraint on emailKey
    // caught it. Treat it the same as "this member already exists."
    if (isUniqueViolation(err)) {
      const raced = await findMemberByEmail(club, input.email);
      if (raced) return raced;
    }
    throw err;
  }
}

/** Masks an email for display on the code-entry step, e.g. "j•••@example.com". */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "•••••";
  return `${user[0] ?? ""}•••@${domain}`;
}

/** Generates a fresh 6-digit code, stores it, and best-effort emails it — never blocks login on a delivery failure. */
export async function issueLoginCode(member: Member): Promise<void> {
  const db = getDb();
  if (!member.email) {
    throw new Error("Member has no email on file — email-code login needs one.");
  }
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

  await db.insert(loginCodes).values({ memberId: member.id, code, expiresAt });

  // Always logged server-side so this is verifiable in local dev without
  // Resend configured — never exposed to the client.
  console.log(`[login] code for member ${member.id} (${member.email}): ${code}`);

  try {
    await sendEmail(member.email, "Your login code", `<p>Your code: <strong>${code}</strong></p>`);
  } catch (err) {
    console.error("Login code send failed (code is still valid, see server log above):", err);
  }
}

/** Verifies and consumes a code. Returns true exactly once per valid code. */
export async function verifyLoginCode(memberId: number, code: string): Promise<boolean> {
  const db = getDb();
  const [match] = await db
    .select()
    .from(loginCodes)
    .where(
      and(
        eq(loginCodes.memberId, memberId),
        eq(loginCodes.code, code),
        isNull(loginCodes.consumedAt),
        gt(loginCodes.expiresAt, new Date())
      )
    )
    .orderBy(desc(loginCodes.createdAt))
    .limit(1);

  if (!match) {
    // 2026-10-06: diagnostic-only, see claude/next-build.md's "login
    // code verify failing" note. Finds the row the strict query above
    // couldn't, ignoring the consumed/expired/code filters one at a
    // time, so the server log says exactly why this failed instead of
    // just "false" — never silently guessed at again. Cheap: only runs
    // on the failure path, and only a handful of rows exist per member.
    const candidates = await db
      .select()
      .from(loginCodes)
      .where(eq(loginCodes.memberId, memberId))
      .orderBy(desc(loginCodes.createdAt))
      .limit(5);
    if (candidates.length === 0) {
      console.warn(`[login] verify failed for member ${memberId}: no codes ever issued`);
    } else {
      const exact = candidates.find((c) => c.code === code);
      if (!exact) {
        console.warn(
          `[login] verify failed for member ${memberId}: typed "${code}" doesn't match any recent code (most recent issued: "${candidates[0].code}")`
        );
      } else if (exact.consumedAt) {
        console.warn(
          `[login] verify failed for member ${memberId}: code "${code}" was already used at ${exact.consumedAt.toISOString()}`
        );
      } else if (exact.expiresAt <= new Date()) {
        console.warn(
          `[login] verify failed for member ${memberId}: code "${code}" expired at ${exact.expiresAt.toISOString()} (now ${new Date().toISOString()})`
        );
      } else {
        console.warn(`[login] verify failed for member ${memberId}: code "${code}" found valid but query still missed it — investigate`);
      }
    }
    return false;
  }

  await db.update(loginCodes).set({ consumedAt: new Date() }).where(eq(loginCodes.id, match.id));

  return true;
}

/**
 * Grants or revokes curator status. Caller is responsible for checking
 * the acting member is an admin first (see memberSession.ts's
 * requireAdmin) — this function itself trusts its input, same pattern
 * as every other write helper in this app.
 */
export async function setCuratorStatus(memberId: number, isCurator: boolean): Promise<void> {
  const db = getDb();
  await db.update(members).set({ isCurator }).where(eq(members.id, memberId));
}

/** Every curator on the club, for the admin panel's roster — see
 * SettingsBoard.tsx's AdminSection. */
export async function listCurators(clubId: number): Promise<Member[]> {
  const db = getDb();
  return db
    .select()
    .from(members)
    .where(and(eq(members.clubId, clubId), eq(members.isCurator, true)));
}

/**
 * The bootstrap-admin problem (2026-10-06 — see claude/next-build.md):
 * every curator grant up to now required an existing admin to already
 * be logged in to make it, which has no answer for "there are zero
 * admins yet" without a hand-run SQL UPDATE in Supabase. `FOUNDER_EMAIL`
 * is the one standing exception — set it once in Vercel, and that email
 * always gets curator+admin the moment it tries to log in at
 * `/curators`, signed up yet or not. This does NOT weaken the real
 * access gate: isFounderEmail() only ever affects whether a login CODE
 * gets sent, same as any other curator — the actual 6-digit code still
 * goes to that address's real inbox and still has to be typed in before
 * a session exists, so a stranger who merely types this address in gets
 * exactly as far as they would with anyone else's email (nowhere).
 * Every curator added *after* the founder goes through the normal admin
 * panel grant below instead, which only ever promotes an existing
 * member — this bootstrap path is deliberately the only one that can
 * create a brand-new member out of nothing.
 */
export function isFounderEmail(email: string): boolean {
  const founder = process.env.FOUNDER_EMAIL;
  if (!founder) return false;
  return normalizeEmail(email) === normalizeEmail(founder);
}

/** Idempotent — safe to call on every login attempt from the founder
 * email. Creates the member if this is genuinely its first time (no
 * name available yet, since /curators only ever collects an email; see
 * ProfileCard's own "You" fallback for the display-name gap this
 * leaves), then makes sure isCurator/isAdmin are both set. */
export async function ensureFounderAccess(club: Club, email: string): Promise<Member> {
  const member = await findOrCreateMember(club, { email });
  if (member.isCurator && member.isAdmin) return member;

  const db = getDb();
  const [updated] = await db
    .update(members)
    .set({ isCurator: true, isAdmin: true })
    .where(eq(members.id, member.id))
    .returning();
  return updated;
}

// Re-exported here so callers that only touch members.ts don't also
// need to import from memberToken.ts for the common case of "create a
// member, give it a token."
export { generateMemberToken };
