import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { submissions } from "@/db/schema";
import { getDefaultClub } from "@/lib/club";
import { getDropStatus } from "@/lib/dropStatus";
import { isValidMusicLink } from "@/lib/musicLink";
import { resolveSongMetadata } from "@/lib/odesli";
import { findDuplicateInDrop } from "@/lib/duplicateCheck";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { link, name, force } = body as { link?: string; name?: string; force?: boolean };
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!link || !link.trim()) {
    return NextResponse.json(
      { error: "That link doesn't look right — try pasting it again." },
      { status: 400 }
    );
  }
  if (!isValidMusicLink(link)) {
    return NextResponse.json(
      { error: "That link doesn't look right — try pasting it again." },
      { status: 400 }
    );
  }

  const club = await getDefaultClub();
  const status = await getDropStatus(club);

  // Best-effort metadata lookup — never blocks the submission on failure.
  const metadata = await resolveSongMetadata(link.trim());

  // Someone else may have already submitted (or a curator already picked)
  // this same link or song for this drop. Not blocked — just confirmed,
  // since submitting the same favorite twice can be intentional.
  if (!force) {
    const duplicate = await findDuplicateInDrop({
      clubId: club.id,
      dropNum: status.nextDropNum,
      dropId: status.current ? status.current.id : null,
      link: link.trim(),
      title: metadata?.title ?? null,
      artist: metadata?.artist ?? null,
    });
    if (duplicate) {
      return NextResponse.json({
        duplicate: true,
        existing: { title: duplicate.title, artist: duplicate.artist },
      });
    }
  }

  const db = getDb();
  await db.insert(submissions).values({
    clubId: club.id,
    dropNum: status.nextDropNum,
    link: link.trim(),
    title: metadata?.title ?? null,
    artist: metadata?.artist ?? null,
    artworkUrl: metadata?.artworkUrl ?? null,
    // Visible to curators in full on /overview's pile (they need it to
    // dedupe and spot abuse) — but never on a public surface. That's the
    // anonymity rule from design-handoff.md: hidden from other
    // subscribers, not from curators.
    submittedBy: name.trim(),
  });

  return NextResponse.json({ ok: true, dropNum: status.nextDropNum });
}
