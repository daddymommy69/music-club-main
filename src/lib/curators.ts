import { randomInt } from "crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { curators, curatorLoginCodes, type Club, type Curator } from "@/db/schema";
import { normalizePhone, normalizeEmail, isUniqueViolation } from "./normalize";
import { sendSms } from "./sms";
import { sendEmail } from "./email";

const CODE_TTL_MINUTES = 10;

export type DestinationType = "phone" | "email";

export function detectDestinationType(raw: string): DestinationType {
  return raw.includes("@") ? "email" : "phone";
}

/** Looks up by the normalized *Key column, which is indexed and unique per club. */
export async function findCuratorByDestination(
  club: Club,
  type: DestinationType,
  value: string
): Promise<Curator | null> {
  const db = getDb();
  if (type === "phone") {
    const target = normalizePhone(value);
    const [row] = await db
      .select()
      .from(curators)
      .where(and(eq(curators.clubId, club.id), eq(curators.phoneKey, target)))
      .limit(1);
    return row ?? null;
  }
  const target = normalizeEmail(value);
  const [row] = await db
    .select()
    .from(curators)
    .where(and(eq(curators.clubId, club.id), eq(curators.emailKey, target)))
    .limit(1);
  return row ?? null;
}

export async function createCurator(
  club: Club,
  name: string,
  type: DestinationType,
  value: string
): Promise<Curator> {
  const db = getDb();
  try {
    const [created] = await db
      .insert(curators)
      .values({
        clubId: club.id,
        name: name.trim(),
        phone: type === "phone" ? value.trim() : null,
        email: type === "email" ? value.trim() : null,
        phoneKey: type === "phone" ? normalizePhone(value) : null,
        emailKey: type === "email" ? normalizeEmail(value) : null,
      })
      .returning();
    return created;
  } catch (err) {
    // Lost a race with another request creating the same curator between
    // our lookup and this insert — the unique constraint on *Key caught
    // it. Treat it the same as "this curator already exists."
    if (isUniqueViolation(err)) {
      const existing = await findCuratorByDestination(club, type, value);
      if (existing) return existing;
    }
    throw err;
  }
}

/** Masks a destination for display on the code-entry step, e.g. "••••••1234" or "j•••@example.com". */
export function maskDestination(type: DestinationType, value: string): string {
  if (type === "phone") {
    const digits = value.replace(/\D/g, "");
    return `••••••${digits.slice(-4)}`;
  }
  const [user, domain] = value.split("@");
  if (!domain) return "•••••";
  return `${user[0] ?? ""}•••@${domain}`;
}

/** Generates a fresh 6-digit code, stores it, and best-effort sends it — never blocks login on a delivery failure. */
export async function issueLoginCode(
  curator: Curator,
  type: DestinationType,
  value: string
): Promise<void> {
  const db = getDb();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

  await db.insert(curatorLoginCodes).values({ curatorId: curator.id, code, expiresAt });

  // Always logged server-side so this is verifiable in local dev without
  // Twilio/Resend configured — never exposed to the client.
  console.log(`[curator login] code for curator ${curator.id} (${value}): ${code}`);

  try {
    if (type === "phone") {
      await sendSms(value, `Your project music club curator code: ${code}`);
    } else {
      await sendEmail(value, "Your curator login code", `<p>Your code: <strong>${code}</strong></p>`);
    }
  } catch (err) {
    console.error("Curator code send failed (code is still valid, see server log above):", err);
  }
}

/** Verifies and consumes a code. Returns true exactly once per valid code. */
export async function verifyLoginCode(curatorId: number, code: string): Promise<boolean> {
  const db = getDb();
  const [match] = await db
    .select()
    .from(curatorLoginCodes)
    .where(
      and(
        eq(curatorLoginCodes.curatorId, curatorId),
        eq(curatorLoginCodes.code, code),
        isNull(curatorLoginCodes.consumedAt),
        gt(curatorLoginCodes.expiresAt, new Date())
      )
    )
    .orderBy(desc(curatorLoginCodes.createdAt))
    .limit(1);

  if (!match) return false;

  await db
    .update(curatorLoginCodes)
    .set({ consumedAt: new Date() })
    .where(eq(curatorLoginCodes.id, match.id));

  return true;
}

export async function getCuratorById(id: number): Promise<Curator | null> {
  const db = getDb();
  const [row] = await db.select().from(curators).where(eq(curators.id, id)).limit(1);
  return row ?? null;
}
