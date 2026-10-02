import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { submissions, songs } from "@/db/schema";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";
import { resolveSongMetadata } from "@/lib/odesli";
import { findDuplicateInDrop } from "@/lib/duplicateCheck";

/** Pulls a subscriber submission straight into the logged-in curator's picks. */
export async function POST(request: Request) {
  const curator = await getSessionMember();
  if (!curator || !curator.isCurator) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = body as { submissionId?: number; force?: boolean } | null;
  const submissionId = parsed?.submissionId;
  const force = !!parsed?.force;
  if (!submissionId) {
    return NextResponse.json({ error: "Missing submission" }, { status: 400 });
  }

  const club = await getDefaultClub();
  if (curator.clubId !== club.id) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const drop = await getOpenDrop(club);
  if (!drop) {
    return NextResponse.json({ error: "No drop in progress right now." }, { status: 400 });
  }

  const db = getDb();
  const [submission] = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.id, submissionId), eq(submissions.clubId, club.id)))
    .limit(1);

  if (!submission) {
    return NextResponse.json({ error: "That submission wasn't found." }, { status: 404 });
  }
  if (submission.pulledAt) {
    return NextResponse.json({ error: "Already picked." }, { status: 400 });
  }

  // The submission usually already has metadata from /api/submit's
  // best-effort Odesli lookup — reuse it. Retry once here if it's
  // missing, since songs.title/artist are required (unlike submissions').
  let title = submission.title;
  let artist = submission.artist;
  let artworkUrl = submission.artworkUrl;
  if (!title || !artist) {
    const metadata = await resolveSongMetadata(submission.link);
    if (!metadata) {
      return NextResponse.json(
        { error: "Couldn't read this link yet — try again in a moment." },
        { status: 502 }
      );
    }
    title = metadata.title;
    artist = metadata.artist;
    artworkUrl = metadata.artworkUrl;
  }

  // Same link or song already picked (possibly from a different
  // submission) for this drop? Warn, don't block.
  if (!force) {
    const duplicate = await findDuplicateInDrop({
      clubId: club.id,
      dropNum: drop.num,
      dropId: drop.id,
      link: submission.link,
      title,
      artist,
      excludeSubmissionId: submission.id,
    });
    if (duplicate) {
      return NextResponse.json({
        duplicate: true,
        existing: { title: duplicate.title, artist: duplicate.artist },
      });
    }
  }

  // Atomic claim: only one concurrent request can win this update (the
  // WHERE clause requires pulledAt still be null), so two curators
  // quick-adding the same submission at once can't both succeed and
  // create duplicate picks. Whoever loses the race sees "Already picked."
  // instead of racing past a separate check-then-act. (This still leaves
  // a narrow, non-atomic window between the duplicate check above and
  // this claim — acceptable here since that check is advisory by nature,
  // same as the other two duplicate-check call sites; this claim is what
  // guarantees the same submission can't become two picks.)
  const claimed = await db
    .update(submissions)
    .set({ pulledAt: new Date() })
    .where(
      and(
        eq(submissions.id, submissionId),
        eq(submissions.clubId, club.id),
        isNull(submissions.pulledAt)
      )
    )
    .returning();

  if (!claimed[0]) {
    return NextResponse.json({ error: "Already picked." }, { status: 400 });
  }

  const [song] = await db
    .insert(songs)
    .values({
      dropId: drop.id,
      title,
      artist,
      artworkUrl,
      sourceUrl: submission.link,
      submittedBy: submission.submittedBy,
      curatorCredit: curator.name,
      curatorId: curator.id,
    })
    .returning();

  return NextResponse.json({ ok: true, song });
}
