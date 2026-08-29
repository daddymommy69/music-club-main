import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { submissions, songs } from "@/db/schema";

export type DuplicateInfo = {
  title: string | null;
  artist: string | null;
  link: string;
};

/** Same song if both sides have resolved title+artist and they match
 * (case/whitespace-insensitive) — catches a Spotify link and an Apple
 * Music link for the same track, which won't share a URL. */
function sameSong(
  aTitle: string | null,
  aArtist: string | null,
  bTitle: string | null,
  bArtist: string | null
): boolean {
  if (!aTitle || !aArtist || !bTitle || !bArtist) return false;
  return (
    aTitle.trim().toLowerCase() === bTitle.trim().toLowerCase() &&
    aArtist.trim().toLowerCase() === bArtist.trim().toLowerCase()
  );
}

/**
 * Looks for the same link (exact match) or the same resolved song already
 * present for this drop — among both the submission pile and the picks
 * already in the room. Scoped to just this drop, not all-time history:
 * an old favorite from three drops ago won't trigger a warning.
 */
export async function findDuplicateInDrop(opts: {
  clubId: number;
  dropNum: number;
  dropId: number | null;
  link: string;
  title: string | null;
  artist: string | null;
  excludeSubmissionId?: number;
}): Promise<DuplicateInfo | null> {
  const db = getDb();
  const link = opts.link.trim();

  const subRows = await db
    .select({
      id: submissions.id,
      link: submissions.link,
      title: submissions.title,
      artist: submissions.artist,
    })
    .from(submissions)
    .where(and(eq(submissions.clubId, opts.clubId), eq(submissions.dropNum, opts.dropNum)));

  for (const row of subRows) {
    if (opts.excludeSubmissionId && row.id === opts.excludeSubmissionId) continue;
    if (row.link.trim() === link || sameSong(row.title, row.artist, opts.title, opts.artist)) {
      return { title: row.title, artist: row.artist, link: row.link };
    }
  }

  if (opts.dropId != null) {
    const songRows = await db
      .select({ sourceUrl: songs.sourceUrl, title: songs.title, artist: songs.artist })
      .from(songs)
      .where(eq(songs.dropId, opts.dropId));

    for (const row of songRows) {
      const rowLink = row.sourceUrl?.trim() ?? null;
      if (rowLink === link || sameSong(row.title, row.artist, opts.title, opts.artist)) {
        return { title: row.title, artist: row.artist, link: rowLink ?? link };
      }
    }
  }

  return null;
}
