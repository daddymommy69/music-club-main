import { NextResponse } from "next/server";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { updateSongNote, deleteSongNote } from "@/lib/notes";

/**
 * Edit/delete path for one post in a song's blurb feed (2026-10-16
 * "feed of posts" redesign) — same shape as drop-note/[id]/route.ts,
 * just scoped to a song note. Ownership enforced at the query layer
 * (src/lib/notes.ts's updateSongNote/deleteSongNote match on
 * curatorId, not just id), so this can't touch another curator's post.
 */
async function authedCurator() {
  const curator = await getSessionMember();
  if (!curator || !curator.isCurator) {
    return { error: NextResponse.json({ error: "Not logged in" }, { status: 401 }) } as const;
  }
  const club = await getDefaultClub();
  if (curator.clubId !== club.id) {
    return { error: NextResponse.json({ error: "Not logged in" }, { status: 401 }) } as const;
  }
  return { curator } as const;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authedCurator();
  if ("error" in auth) return auth.error;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid post" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { text } = (body ?? {}) as { text?: string };
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    return NextResponse.json(
      { error: "A post can't be blank — delete it instead if you want it gone." },
      { status: 400 }
    );
  }

  try {
    const updated = await updateSongNote(id, auth.curator.id, trimmed);
    if (!updated) {
      return NextResponse.json({ error: "Couldn't find that post." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Song blurb edit failed:", err);
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authedCurator();
  if ("error" in auth) return auth.error;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid post" }, { status: 400 });
  }

  try {
    const deleted = await deleteSongNote(id, auth.curator.id);
    if (!deleted) {
      return NextResponse.json({ error: "Couldn't find that post." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Song blurb delete failed:", err);
    return NextResponse.json({ error: "Couldn't delete that. Try again." }, { status: 500 });
  }
}
