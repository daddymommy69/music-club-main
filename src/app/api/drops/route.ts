import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops } from "@/db/schema";
import { getDefaultClub } from "@/lib/club";
import { checkBearerAuth } from "@/lib/adminAuth";
import { isValidMusicLink } from "@/lib/musicLink";

/**
 * Minimal way to start a new drop before the real curator room (Phase
 * 1.5) exists. Protected by the same admin secret as /api/send.
 *
 * curl -X POST https://yoursite/api/drops \
 *   -H "Authorization: Bearer <ADMIN_SECRET>" \
 *   -H "Content-Type: application/json" \
 *   -d '{"appleUrl": "https://music.apple.com/...", "spotifyUrl": "...", "title": "optional"}'
 */
export async function POST(request: Request) {
  if (!checkBearerAuth(request, "ADMIN_SECRET")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { appleUrl, spotifyUrl, title } = body as {
    appleUrl?: string;
    spotifyUrl?: string;
    title?: string;
  };

  if (appleUrl && !isValidMusicLink(appleUrl)) {
    return NextResponse.json({ error: "appleUrl doesn't look like a valid link" }, { status: 400 });
  }
  if (spotifyUrl && !isValidMusicLink(spotifyUrl)) {
    return NextResponse.json({ error: "spotifyUrl doesn't look like a valid link" }, { status: 400 });
  }

  const db = getDb();
  const club = await getDefaultClub();

  const [last] = await db
    .select()
    .from(drops)
    .where(eq(drops.clubId, club.id))
    .orderBy(desc(drops.num))
    .limit(1);

  // Only one open drop at a time — otherwise a second call before the
  // first ships silently orphans it (getCurrentDrop only ever looks at
  // the highest drop.num, so the first one becomes unreachable).
  if (last && !last.publishedAt) {
    return NextResponse.json(
      { error: `Drop #${last.num} hasn't shipped yet — send it before starting a new one.` },
      { status: 400 }
    );
  }

  const [created] = await db
    .insert(drops)
    .values({
      clubId: club.id,
      num: (last?.num ?? 0) + 1,
      title: title ?? null,
      appleUrl: appleUrl ?? null,
      spotifyUrl: spotifyUrl ?? null,
    })
    .returning();

  return NextResponse.json({ ok: true, drop: created });
}
