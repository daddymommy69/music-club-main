import { randomInt } from "crypto";
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { members, loginCodes, pendingCurators, pendingCuratorDropNums, type Club, type Member } from "@/db/schema";
import { normalizePhone, normalizeEmail, isUniqueViolation, slugify } from "./normalize";
import { sendEmail } from "./email";
import { LOGIN_CODE_SUBJECT, loginCodeEmailHtml } from "./messages";
import { generateMemberToken } from "./memberToken";
import { grantCuratorAssignment, type GrantParams } from "./curatorAssignments";

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

export async function getMemberBySlug(slug: string): Promise<Member | null> {
  const db = getDb();
  const [row] = await db.select().from(members).where(eq(members.slug, slug)).limit(1);
  return row ?? null;
}

/** True if `slug` is free to use — either nobody has it, or it already
 * belongs to `excludeMemberId` (so saving your own unchanged handle
 * never reports itself as taken). Used by the account-profile route
 * when someone edits their own handle. */
export async function isSlugAvailable(slug: string, excludeMemberId?: number): Promise<boolean> {
  const db = getDb();
  const [row] = await db.select({ id: members.id }).from(members).where(eq(members.slug, slug)).limit(1);
  if (!row) return true;
  return excludeMemberId != null && row.id === excludeMemberId;
}

/**
 * Resolves a free-text name into a unique /u/[slug] value (2026-10-19
 * — founder's own ask: every member, not just curators, gets a public
 * profile page). Auto-generated at signup so every member has a
 * working URL immediately with no setup required — editable later from
 * Account settings. Falls back to "member" for a name-less signup
 * (phone-only, no name typed), then to "member-<n>" suffixes if that's
 * also taken. The caller (findOrCreateMember et al.) still has to
 * handle a lost race against a concurrent signup for the exact same
 * candidate — this just makes that race rare, not impossible, same
 * spirit as every other "check then insert" path in this file.
 */
export async function generateUniqueMemberSlug(name: string | null): Promise<string> {
  const base = slugify(name?.trim() || "") || "member";
  let candidate = base;
  let suffix = 2;
  for (let i = 0; i < 50; i++) {
    if (await isSlugAvailable(candidate)) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return `${base}-${Date.now()}`;
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
  const name = input.name?.trim() || null;

  // Bounded retry loop (2026-10-19 — /u/[slug] launch): almost always
  // succeeds on the first attempt, since generateUniqueMemberSlug
  // already checked availability moments ago — this loop only exists
  // to survive the rare case where a concurrent signup takes the exact
  // same candidate slug in between that check and this insert. Mirrors
  // the existing emailKey race-handling below, just for slug instead.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = await generateUniqueMemberSlug(name);

    try {
      const [created] = await db
        .insert(members)
        .values({
          clubId: club.id,
          name,
          email: input.email.trim(),
          emailKey,
          phone: input.phone?.trim() || null,
          phoneKey: input.phone ? normalizePhone(input.phone) : null,
          wantsText: input.wantsText ?? false,
          wantsEmail: input.wantsEmail ?? true,
          smsConsent: input.smsConsent ?? false,
          smsOptInAt: input.smsConsent ? new Date() : null,
          memberToken: generateMemberToken(),
          slug,
        })
        .returning();

      // Consume a pending curator invite, if an admin typed this exact
      // email into Admin Tools before this person ever signed up
      // (2026-10-09 — see claude/next-build.md and
      // addPendingCurator/listPendingCurators below). Reads the pending
      // row (and, for "drops" mode, its drop numbers) BEFORE deleting
      // it — the delete's own ON DELETE CASCADE wipes
      // pendingCuratorDropNums in the same statement, so those numbers
      // have to be read first or they're gone. The DELETE...RETURNING
      // by id is still the actual "claim" — only this signup gets to
      // consume a given invite, same atomic-claim pattern as Round 9's
      // double-ship fix, so two near-simultaneous signups for the same
      // email can't both see the invite and both grant themselves
      // curator. Best effort throughout: a failure here shouldn't fail
      // the signup itself — it would just leave the invite sitting
      // there for the admin to notice and grant by hand instead.
      try {
        const [pending] = await db
          .select()
          .from(pendingCurators)
          .where(and(eq(pendingCurators.clubId, club.id), eq(pendingCurators.emailKey, emailKey)))
          .limit(1);

        if (pending) {
          let dropNums: number[] = [];
          if (pending.mode === "drops") {
            const rows = await db
              .select({ dropNum: pendingCuratorDropNums.dropNum })
              .from(pendingCuratorDropNums)
              .where(eq(pendingCuratorDropNums.pendingCuratorId, pending.id));
            dropNums = rows.map((r) => r.dropNum);
          }

          const [claimed] = await db.delete(pendingCurators).where(eq(pendingCurators.id, pending.id)).returning();
          if (claimed) {
            // 2026-11-03 "scoped curator terms" round, then a same-day
            // follow-up (founder's own report: a drop-count/date/
            // specific-drops grant for someone not signed up yet got
            // refused entirely) — this invite now carries whatever
            // grant the admin actually chose, not always "unlimited."
            // Granting through curatorAssignments.ts rather than
            // flipping isCurator directly means a signup that consumes
            // an invite shows up in the Admin Tools roster the same
            // way a direct grant does. That function also sends the
            // "you're a chosen one" email itself — best-effort, same
            // as this used to inline here.
            const params: GrantParams =
              claimed.mode === "count"
                ? { mode: "count", count: claimed.remainingCount ?? 1 }
                : claimed.mode === "date"
                  ? { mode: "date", endDate: claimed.endDate ?? new Date() }
                  : claimed.mode === "drops"
                    ? { mode: "drops", dropNums }
                    : { mode: "unlimited" };
            await grantCuratorAssignment(club, created, params, claimed.invitedBy);
            const promoted = await getMemberById(created.id);
            if (promoted) return promoted;
          }
        }
      } catch (err) {
        console.error("Pending-curator invite consume failed (member still created fine):", err);
      }

      return created;
    } catch (err) {
      // Lost a race with another request creating the same member
      // between our lookup and this insert — the unique constraint on
      // emailKey caught it. Treat it the same as "this member already
      // exists."
      if (isUniqueViolation(err)) {
        const raced = await findMemberByEmail(club, input.email);
        if (raced) return raced;

        // Not an email race — must be the slug's unique constraint
        // losing to a concurrent signup that grabbed the same candidate
        // first. Retry with a freshly-generated slug rather than
        // failing the whole signup over it.
        continue;
      }
      throw err;
    }
  }

  throw new Error("findOrCreateMember: exhausted slug-collision retries");
}

/**
 * Pre-authorizes an email for curator status before that person has
 * signed up (2026-10-09 — see claude/next-build.md and
 * findOrCreateMember above, which consumes this the moment they do).
 * Caller (the admin route) is responsible for checking the email
 * doesn't already belong to an existing member first — this function
 * doesn't look, it just inserts.
 *
 * `params` (2026-11-03 follow-up — founder's own report: a scoped
 * grant for someone not signed up yet was flatly refused) carries the
 * same grant an existing member would get — see findOrCreateMember's
 * consume logic above for how it's applied. Defaults to "unlimited",
 * the only thing this ever supported before.
 *
 * Re-adding an email that's already pending updates its grant terms to
 * the new ones (an admin redoing this clearly means the new terms)
 * rather than silently keeping whatever the first attempt set.
 */
export async function addPendingCurator(
  club: Club,
  email: string,
  invitedBy: string | null,
  params: GrantParams = { mode: "unlimited" }
): Promise<{ id: number; email: string }> {
  const db = getDb();
  const emailKey = normalizeEmail(email);
  const values = {
    clubId: club.id,
    email: email.trim(),
    emailKey,
    invitedBy,
    mode: params.mode,
    remainingCount: params.mode === "count" ? params.count : null,
    endDate: params.mode === "date" ? params.endDate : null,
  };

  async function setDropNums(pendingCuratorId: number) {
    if (params.mode !== "drops" || params.dropNums.length === 0) return;
    await db.insert(pendingCuratorDropNums).values(params.dropNums.map((dropNum) => ({ pendingCuratorId, dropNum })));
  }

  try {
    const [created] = await db.insert(pendingCurators).values(values).returning();
    await setDropNums(created.id);
    return { id: created.id, email: created.email };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const [existing] = await db
      .select({ id: pendingCurators.id, email: pendingCurators.email })
      .from(pendingCurators)
      .where(and(eq(pendingCurators.clubId, club.id), eq(pendingCurators.emailKey, emailKey)))
      .limit(1);
    if (!existing) return { id: -1, email: email.trim() };

    await db.update(pendingCurators).set(values).where(eq(pendingCurators.id, existing.id));
    await db.delete(pendingCuratorDropNums).where(eq(pendingCuratorDropNums.pendingCuratorId, existing.id));
    await setDropNums(existing.id);
    return existing;
  }
}

/** Every pending curator invite for the Admin Tools roster — see
 * AdminToolsPanel.tsx. Mirrors curatorAssignments.ts's
 * listMemberRoster in shape: the grant terms come along so the panel
 * can describe what each invite becomes on signup, not just that one
 * exists. */
export async function listPendingCurators(clubId: number): Promise<
  {
    id: number;
    email: string;
    invitedBy: string | null;
    createdAt: Date;
    mode: (typeof pendingCurators.$inferSelect)["mode"];
    remainingCount: number | null;
    endDate: Date | null;
    dropNums: number[];
  }[]
> {
  const db = getDb();
  const rows = await db
    .select()
    .from(pendingCurators)
    .where(eq(pendingCurators.clubId, clubId))
    .orderBy(asc(pendingCurators.createdAt));

  const dropsModeIds = rows.filter((r) => r.mode === "drops").map((r) => r.id);
  const dropNumsByPending = new Map<number, number[]>();
  if (dropsModeIds.length > 0) {
    const dropNumRows = await db
      .select()
      .from(pendingCuratorDropNums)
      .where(inArray(pendingCuratorDropNums.pendingCuratorId, dropsModeIds));
    for (const r of dropNumRows) {
      const list = dropNumsByPending.get(r.pendingCuratorId) ?? [];
      list.push(r.dropNum);
      dropNumsByPending.set(r.pendingCuratorId, list);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    invitedBy: r.invitedBy,
    createdAt: r.createdAt,
    mode: r.mode,
    remainingCount: r.remainingCount,
    endDate: r.endDate,
    dropNums: (dropNumsByPending.get(r.id) ?? []).sort((a, b) => a - b),
  }));
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
    await sendEmail(member.email, LOGIN_CODE_SUBJECT, loginCodeEmailHtml(code));
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

// setCuratorStatus/listCurators removed (2026-11-03 "scoped curator
// terms" round — see claude/next-build.md): granting/revoking and the
// admin roster both moved to src/lib/curatorAssignments.ts
// (grantCuratorAssignment/endCuratorAssignmentManual/listMemberRoster),
// which also tracks WHY and for how long, not just on/off. The one
// direct isCurator write left outside that file is ensureFounderAccess
// below — the founder's own access, which was never meant to expire.

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
  if (member.isCurator && member.isAdmin && member.everCurator) return member;

  const db = getDb();
  const [updated] = await db
    .update(members)
    .set({ isCurator: true, isAdmin: true, everCurator: true })
    .where(eq(members.id, member.id))
    .returning();
  return updated;
}

// Re-exported here so callers that only touch members.ts don't also
// need to import from memberToken.ts for the common case of "create a
// member, give it a token."
export { generateMemberToken };
