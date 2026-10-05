import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";
import { isValidMusicLink } from "@/lib/musicLink";
import { resolveSongMetadata } from "@/lib/odesli";
import {
  getListenerPick,
  submitListenerPick,
  editListenerPick,
  withdrawListenerPick,
} from "@/lib/listenerPicks";

/**
 * Submit-or-edit a Listener Pick for whatever drop is currently open.
 * One POST handles both: an existing pick is edited in place, no pick
 * yet creates one — the client (ListenerPickForm.tsx) doesn't need to
 * know which case it's in.
 *
 * Odesli-is-dead judgment call (see claude/next-build.md and plan.md's
 * "found, not fixed" note): the old /room add-a-pick route hard-fails
 * with a 502 when Odesli doesn't resolve a link, because `songs.title`/
 * `artist` are NOT NULL and that route has no other way to fill them.
 * Since Odesli has been 401ing on every request since 2026-07-31, doing
 * the same thing here would make submitting a Listener Pick silently
 * impossible for everyone, forever — not an acceptable v1 behavior for
 * a brand-new feature. Simplified instead: the Odesli lookup is still
 * attempted first (free enrichment on the rare chance it ever comes
 * back), but when it fails, the member is asked to type the title and
 * artist themselves rather than being blocked outright.
 */
export async function POST(request: Request) {
  const member = await requireMemberSession();
  if (!member) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = body as { link?: string; title?: string; artist?: string } | null;
  const link = parsed?.link?.trim();
  if (!link || !isValidMusicLink(link)) {
    return NextResponse.json(
      { error: "That link doesn't look right — try pasting it again." },
      { status: 400 }
    );
  }

  const club = await getDefaultClub();
  if (member.clubId !== club.id) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const drop = await getOpenDrop(club);
  if (!drop) {
    return NextResponse.json({ error: "There's no drop open for submissions right now." }, { status: 400 });
  }

  const metadata = await resolveSongMetadata(link);
  const title = metadata?.title ?? parsed?.title?.trim() ?? "";
  const artist = metadata?.artist ?? parsed?.artist?.trim() ?? "";
  if (!title || !artist) {
    return NextResponse.json(
      {
        error:
          "We couldn't read that link automatically — add the title and artist yourself so we know what it is.",
        needsManualMetadata: true,
      },
      { status: 400 }
    );
  }
  const artworkUrl = metadata?.artworkUrl ?? null;

  const existing = await getListenerPick(drop.id, member.id);
  if (existing) {
    const updated = await editListenerPick(drop.id, member.id, { link, title, artist, artworkUrl });
    return NextResponse.json({ ok: true, mode: "edited", song: updated });
  }

  const result = await submitListenerPick({ dropId: drop.id, memberId: member.id, link, title, artist, artworkUrl });
  if (!result.ok) {
    return NextResponse.json({ error: "You've already got a pick in for this drop." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, mode: "created", song: result.song });
}

/** Withdraws the member's Listener Pick for the currently open drop. */
export async function DELETE() {
  const member = await requireMemberSession();
  if (!member) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const club = await getDefaultClub();
  if (member.clubId !== club.id) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const drop = await getOpenDrop(club);
  if (!drop) {
    return NextResponse.json({ error: "There's no drop open for submissions right now." }, { status: 400 });
  }

  const withdrawn = await withdrawListenerPick(drop.id, member.id);
  return NextResponse.json({ ok: true, withdrawn });
}
