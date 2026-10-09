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
   * to fill it in later. Preferred OVER Odesli's own artwork when both
   * are available (2026-10-07, round 4 — the actual "artwork still has
   * a frame" bug: Odesli's Apple Music thumbnailUrl is sometimes a
   * 1200x630 wide link-preview crop, not the square cover — square-crop
   * it in odesli.ts too, but a known-square Spotify-search result
   * should win outright rather than risk that whenever both exist). */
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
  const artworkUrl = params.artworkUrl ?? metadata?.artworkUrl ?? null;

  const existing = await getListenerPick(params.dropId, params.memberId);
  if (existing) {
    const updated = await editListenerPick(params.dropId, params.memberId, {
      link: params.link,
      title,
      artist,
      artworkUrl,
    });
    if (!updated.ok) {
      // "drop-closed" (2026-10-09 audit fix — see claude/next-build.md
      // and listenerPicks.ts's dropIsOpenForSubmission): the drop
      // shipped or got canceled in the moment between this request
      // starting and reaching the actual write. "not-found" is the
      // pre-existing race this comment used to describe alone — the
      // row it was just told exists vanished between the two queries
      // (a withdraw racing this request).
      if (updated.reason === "drop-closed") {
        return { ok: false, status: 409, error: "This drop just shipped — too late to change your pick." };
      }
      return { ok: false, status: 409, error: "Your pick was withdrawn just now — try submitting again." };
    }
    return { ok: true, mode: "edited", song: updated.song };
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
    if (result.reason === "drop-closed") {
      return { ok: false, status: 409, error: "This drop just shipped — too late to add a pick." };
    }
    return { ok: false, status: 409, error: "You've already got a pick in for this drop." };
  }
  return { ok: true, mode: "created", song: result.song };
}
