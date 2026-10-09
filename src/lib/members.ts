import { randomInt } from "crypto";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { members, loginCodes, pendingCurators, type Club, type Member } from "@/db/schema";
import { normalizePhone, normalizeEmail, isUniqueViolation } from "./normalize";
import { sendEmail } from "./email";
import { generateMemberToken } from "./memberToken";

const CODE_TTL_MINUTES = 10;

/** Wrong guesses allowed against a single outstanding code before it
 * locks (2026-10-08 audit fix — see claude/next-build.md). Independent
 * of the code's 10-minute expiry — previously that expiry was the ONLY
 * protection a code had, which left a real brute-force window against
 * the 6-digit space, including for curator/admin logins. */
const LOCK_AFTER_ATTEMPTS = 8;

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

  const emailKey = normalizeEmail(input.email);

  try {
    const [created] = await db
      .insert(members)
      .values({
        clubId: club.id,
        name: input.name?.trim() || null,
        email: input.email.trim(),
        emailKey,
        phone: input.phone?.trim() || null,
        phoneKey: input.phone ? normalizePhone(input.phone) : null,
        wantsText: input.wantsText ?? false,
        wantsEmail: input.wantsEmail ?? true,
        smsConsent: input.smsConsent ?? false,
        smsOptInAt: input.smsConsent ? new Date() : null,
        memberToken: generateMemberToken(),
      })
      .returning();

    // Consume a pending curator invite, if an admin typed this exact
    // email into Settings' Curators panel before this person ever
    // signed up (2026-10-09 — see claude/next-build.md and
    // addPendingCurator/listPendingCurators below). The DELETE...
    // RETURNING is the "claim" — only this signup gets to consume a
    // given invite, same atomic-claim pattern as Round 9's double-ship
    // fix, so two near-simultaneous signups for the same email can't
    // both see the invite and both grant themselves curator. Best
    // effort: a failure here shouldn't fail the signup itself — it
    // would just leave the invite sitting there for the admin to
    // notice and grant by hand instead.
    try {
      const [claimed] = await db
        .delete(pendingCurators)
        .where(and(eq(pendingCurators.clubId, club.id), eq(pendingCurators.emailKey, emailKey)))
        .returning();
      if (claimed) {
        const [promoted] = await db
          .update(members)
          .set({ isCurator: true })
          .where(eq(members.id, created.id))
          .returning();
        return promoted;
      }
    } catch (err) {
      console.error("Pending-curator invite consume failed (member still created fine):", err);
    }

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

/**
 * Pre-authorizes an email for curator status before that person has
 * signed up (2026-10-09 — see claude/next-build.md and
 * findOrCreateMember above, which consumes this the moment they do).
 * Caller (the admin route) is responsible for checking the email
 * doesn't already belong to an existing member first — this function
 * doesn't look, it just inserts. Idempotent: adding the same pending
 * email twice is a no-op, same "already in progress" spirit as every
 * other insert-and-catch-the-unique-violation path in this app.
 */
export async function addPendingCurator(
  club: Club,
  email: string,
  invitedBy: string | null
): Promise<{ id: number; email: string }> {
  const db = getDb();
  const emailKey = normalizeEmail(email);
  try {
    const [created] = await db
      .insert(pendingCurators)
      .values({ clubId: club.id, email: email.trim(), emailKey, invitedBy })
      .returning();
    return { id: created.id, email: created.email };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Already pending — hand back the existing row's id so the caller
    // (the admin panel) still has something real to show/cancel.
    const [existing] = await db
      .select({ id: pendingCurators.id, email: pendingCurators.email })
      .from(pendingCurators)
      .where(and(eq(pendingCurators.clubId, club.id), eq(pendingCurators.emailKey, emailKey)))
      .limit(1);
    return existing ?? { id: -1, email: email.trim() };
  }
}

/** Every pending curator invite for the admin panel's own list — see
 * SettingsBoard.tsx's AdminSection. */
export async function listPendingCurators(
  clubId: number
): Promise<{ id: number; email: string; invitedBy: string | null; createdAt: Date }[]> {
  const db = getDb();
  return db
    .select({
      id: pendingCurators.id,
      email: pendingCurators.email,
      invitedBy: pendingCurators.invitedBy,
      createdAt: pendingCurators.createdAt,
    })
    .from(pendingCurators)
    .where(eq(pendingCurators.clubId, clubId))
    .orderBy(asc(pendingCurators.createdAt));
}

/** Cancels a pending invite before that person ever signs up — the
 * admin panel's "Cancel" link on a pending row. */
export async function removePendingCurator(id: number): Promise<void> {
  const db = getDb();
  await db.delete(pendingCurators).where(eq(pendingCurators.id, id));
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

export type VerifyCodeResult =
  | { ok: true }
  | { ok: false; reason: "no-code-issued" | "no-match" | "already-used" | "expired" | "locked" };

const VERIFY_FAILURE_MESSAGES: Record<Exclude<VerifyCodeResult, { ok: true }>["reason"], string> = {
  "no-code-issued": "No code was ever sent for this login — go back and request one.",
  "no-match": "That code isn't right — double-check the 6 digits.",
  "already-used": "That code was already used — send yourself a new one.",
  expired: "That code expired — send yourself a new one.",
  locked: "Too many wrong tries on that code — send yourself a new one.",
};

/** The client-facing message for a VerifyCodeResult's failure reason — shared so every verify route says the same thing for the same cause. */
export function verifyCodeFailureMessage(reason: Exclude<VerifyCodeResult, { ok: true }>["reason"]): string {
  return VERIFY_FAILURE_MESSAGES[reason];
}

/**
 * Verifies and consumes a code. Returns a specific failure reason
 * instead of a bare boolean (2026-10-06 QA sweep follow-up — see
 * claude/next-build.md): the generic "that code isn't right" used to
 * cover a typo, an already-used code, and an expired one all the same
 * way, which made it impossible for someone staring at the screen (or
 * the founder debugging over chat) to tell which actually happened.
 * The diagnostic console.warn logging added the same session this was
 * first investigated stays — this just also hands the same
 * classification back to the caller instead of only logging it.
 */
export async function verifyLoginCode(memberId: number, code: string): Promise<VerifyCodeResult> {
  const db = getDb();

  // The single most recent still-live code for this member — used only
  // to gate/track brute-force attempts (2026-10-08 audit fix — see
  // claude/next-build.md), not to decide whether the typed `code` is
  // actually right. A member can have more than one valid outstanding
  // code at once (e.g. hit "resend" twice within the same 10 minutes),
  // and correctly typing an older one still works below, same as
  // before — the attempt counter is deliberately scoped to just the
  // newest row, since that's the one a brute-force script would
  // actually be hammering.
  const [active] = await db
    .select()
    .from(loginCodes)
    .where(
      and(eq(loginCodes.memberId, memberId), isNull(loginCodes.consumedAt), gt(loginCodes.expiresAt, new Date()))
    )
    .orderBy(desc(loginCodes.createdAt))
    .limit(1);

  if (active && active.failedAttempts >= LOCK_AFTER_ATTEMPTS) {
    console.warn(
      `[login] verify blocked for member ${memberId}: code locked after ${active.failedAttempts} wrong attempts — send a new code to clear it`
    );
    return { ok: false, reason: "locked" };
  }

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
    // Count this wrong guess toward the newest outstanding code's
    // lockout, regardless of which reason it ends up classified as
    // below — a typo, a stale code, and an actual guess all look the
    // same from here, and all should count the same toward the limit.
    if (active) {
      await db
        .update(loginCodes)
        .set({ failedAttempts: sql`${loginCodes.failedAttempts} + 1` })
        .where(eq(loginCodes.id, active.id));
    }

    // Finds the row the strict query above couldn't, ignoring the
    // consumed/expired/code filters one at a time, so both the server
    // log and the person on the other end of the screen get the real
    // reason instead of a blanket "false." Cheap: only runs on the
    // failure path, and only a handful of rows exist per member.
    const candidates = await db
      .select()
      .from(loginCodes)
      .where(eq(loginCodes.memberId, memberId))
      .orderBy(desc(loginCodes.createdAt))
      .limit(5);

    if (candidates.length === 0) {
      console.warn(`[login] verify failed for member ${memberId}: no codes ever issued`);
      return { ok: false, reason: "no-code-issued" };
    }

    const exact = candidates.find((c) => c.code === code);
    if (!exact) {
      console.warn(
        `[login] verify failed for member ${memberId}: typed "${code}" doesn't match any recent code (most recent issued: "${candidates[0].code}")`
      );
      return { ok: false, reason: "no-match" };
    }
    if (exact.consumedAt) {
      console.warn(
        `[login] verify failed for member ${memberId}: code "${code}" was already used at ${exact.consumedAt.toISOString()}`
      );
      return { ok: false, reason: "already-used" };
    }
    if (exact.expiresAt <= new Date()) {
      console.warn(
        `[login] verify failed for member ${memberId}: code "${code}" expired at ${exact.expiresAt.toISOString()} (now ${new Date().toISOString()})`
      );
      return { ok: false, reason: "expired" };
    }
    console.warn(`[login] verify failed for member ${memberId}: code "${code}" found valid but query still missed it — investigate`);
    return { ok: false, reason: "no-match" };
  }

  await db.update(loginCodes).set({ consumedAt: new Date() }).where(eq(loginCodes.id, match.id));

  return { ok: true };
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
