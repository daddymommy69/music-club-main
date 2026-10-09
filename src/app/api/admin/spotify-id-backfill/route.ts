import { NextResponse } from "next/server";
import { asc, and, eq, isNull, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops, songs, type Song } from "@/db/schema";
import { getDefaultClub } from "@/lib/club";
import { checkBearerAuth } from "@/lib/adminAuth";
import { resolveSongMetadata } from "@/lib/odesli";

/**
 * One-off: catch up already-shipped songs that are missing a Spotify id
 * (no play icon on the site) using the same link resolution the
 * curator paste-a-pick route now does at add-time (2026-10-08 round —
 * see claude/next-build.md). Unlike /api/admin/spotify-backfill (which
 * builds a whole auto-build playlist via a fuzzy title/artist Spotify
 * search), this just re-resolves each song's own originally-submitted
 * link (songs.sourceUrl) — src/lib/odesli.ts, despite its name, now
 * resolves a Spotify link by exact id and an Apple Music link through
 * Apple's free lookup API plus a best-effort Spotify search, since the
 * actual Odesli/song.link service it's named for shut down for good on
 * 2026-07-31 — and fills in spotifyUri wherever that finds a match.
 * Same "re-resolving" use sourceUrl's own column comment always called
 * out. Never overwrites a song that already has a spotifyUri, and never
 * touches artworkUrl (ship-time auto-build already owns backfilling
 * that).
 *
 * curl -X POST https://yoursite/api/admin/spotify-id-backfill \
 *   -H "Authorization: Bearer <ADMIN_SECRET>" \
 *   -H "Content-Type: application/json" \
 *   -d '{"dropNum": 1}'
 */
export async function POST(request: Request) {
  if (!checkBearerAuth(request, "ADMIN_SECRET")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { dropNum } = body as { dropNum?: number };
  if (!Number.isInteger(dropNum)) {
    return NextResponse.json({ error: "dropNum (integer) required" }, { status: 400 });
  }

  const club = await getDefaultClub();
  const db = getDb();

  const [drop] = await db
    .select()
    .from(drops)
    .where(and(eq(drops.clubId, club.id), eq(drops.num, dropNum!)))
    .limit(1);
  if (!drop) {
    return NextResponse.json({ error: `No drop #${dropNum} in this club.` }, { status: 404 });
  }

  // 2026-10-09 audit fix (see claude/next-build.md): no error handling
  // around any of this before now — same class of bug as the other
  // newer curator-controls routes. resolveSongMetadata already never
  // throws on its own (see odesli.ts), so the realistic failure here is
  // the DB read/writes around it.
  try {
    const candidates = await db
      .select()
      .from(songs)
      .where(and(eq(songs.dropId, drop.id), isNull(songs.spotifyUri), isNotNull(songs.sourceUrl)))
      .orderBy(asc(songs.position), asc(songs.createdAt));

    if (candidates.length === 0) {
      return NextResponse.json({
        ok: true,
        dropNum: drop.num,
        checked: 0,
        matchedCount: 0,
        stillUnmatched: [],
      });
    }

    const results = await Promise.all(
      candidates.map(async (song) => {
        const metadata = await resolveSongMetadata(song.sourceUrl as string);
        return { song, spotifyUri: metadata?.spotifyUri ?? null };
      })
    );

    const matched = results.filter((r): r is { song: Song; spotifyUri: string } => !!r.spotifyUri);
    await Promise.all(
      matched.map(({ song, spotifyUri }) => db.update(songs).set({ spotifyUri }).where(eq(songs.id, song.id)))
    );

    const stillUnmatched = results
      .filter((r) => !r.spotifyUri)
      .map((r) => `${r.song.title} — ${r.song.artist}`);

    return NextResponse.json({
      ok: true,
      dropNum: drop.num,
      checked: candidates.length,
      matchedCount: matched.length,
      stillUnmatched,
    });
  } catch (err) {
    console.error("Spotify id backfill failed:", err);
    return NextResponse.json({ error: "Backfill failed partway through. Try again." }, { status: 500 });
  }
}
