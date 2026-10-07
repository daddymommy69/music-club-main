import type { Song } from "@/db/schema";
import { resolveSongMetadata } from "./odesli";
import { getListenerPick, submitListenerPick, editListenerPick } from "./listenerPicks";

/**
 * The resolve → submit-or-edit sequence shared by the two places a
 * member can post a Listener Pick: the public `/api/submit` endpoint
 * and `/account`'s own `/api/account/listener-pick` box. Both used to
 * duplicate this ~30-line block almost line for line (2026-10-06 QA
 * sweep finding) — pulled out here so a future change to it (e.g.
 * artwork validation) only has to happen once.
 *
 * Deliberately does NOT include link-format validation or the
 * drop/session lookups — those stay in each route, since one route
 * needs to fail fast on a bad link before creating a member, and the
 * other already has its member/drop in hand before calling this. Only
 * the part that was genuinely identical — Odesli lookup, manual
 * title/artist fallback, submit-or-edit — lives here.
 */
export type ResolveListenerPickResult =
  | { ok: true; mode: "created" | "edited"; song: Song }
  | { ok: false; status: number; error: string; needsManualMetadata?: boolean };

export async function resolveAndSubmitListenerPick(params: {
  dropId: number;
  memberId: number;
  link: string;
  title?: string;
  artist?: string;
  /** Already-known artwork (2026-10-07 Browse round — see
   * claude/next-build.md): a song picked from Browse's live Spotify
   * search already has real artwork from that search result, so there's
   * no need to wait on Odesli (dead) or the ship-time auto-build backfill
   * to fill it in later. Ignored when Odesli does resolve metadata (rare,
   * but its artwork would be at least as fresh). */
  artworkUrl?: string | null;
}): Promise<ResolveListenerPickResult> {
  const metadata = await resolveSongMetadata(params.link);
  const title = metadata?.title ?? params.title?.trim() ?? "";
  const artist = metadata?.artist ?? params.artist?.trim() ?? "";
  if (!title || !artist) {
    return {
      ok: false,
      status: 400,
      error:
        "We couldn't read that link automatically — add the title and artist yourself so we know what it is.",
      needsManualMetadata: true,
    };
  }
  const artworkUrl = metadata?.artworkUrl ?? params.artworkUrl ?? null;

  const existing = await getListenerPick(params.dropId, params.memberId);
  if (existing) {
    const updated = await editListenerPick(params.dropId, params.memberId, {
      link: params.link,
      title,
      artist,
      artworkUrl,
    });
    // editListenerPick only returns null if the row it was just told
    // exists vanished between the two queries (a withdraw racing this
    // request) — vanishingly rare for a 3-person club, but report it
    // honestly rather than claiming success.
    if (!updated) {
      return { ok: false, status: 409, error: "Your pick was withdrawn just now — try submitting again." };
    }
    return { ok: true, mode: "edited", song: updated };
  }

  const result = await submitListenerPick({
    dropId: params.dropId,
    memberId: params.memberId,
    link: params.link,
    title,
    artist,
    artworkUrl,
  });
  if (!result.ok) {
    return { ok: false, status: 409, error: "You've already got a pick in for this drop." };
  }
  return { ok: true, mode: "created", song: result.song };
}
