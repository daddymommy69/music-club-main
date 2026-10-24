import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { clubs, drops, songs, type Club, type Drop } from "@/db/schema";
import { sendDropToSubscribers } from "./release";
import { buildSpotifyPlaylistForDrop } from "./spotifyBuild";
import { computeAutoOpenDate } from "./cycle";
import { getDropNotes } from "./notes";
import { combineDropNotes } from "./spotifyDescription";

export type ShipResult = {
  ok: true;
  dropNum: number;
  sent: number;
  total?: number;
  skipped?: string;
  errors?: string[];
  spotifyAutoBuild: {
    matchedCount: number;
    totalCount: number;
    unmatchedTitles: string[];
  } | null;
};

export type ShipFailure = { ok: false; error: string };

/**
 * Shared "finish the drop" logic (2026-10-08 "drop control" round —
 * see claude/next-build.md) — pulled out of the manual
 * PUT /api/overview/ship route so the new daily cron
 * (src/app/api/cron/drops) can auto-ship a drop once its
 * scheduledShipAt passes using the exact same behavior a curator
 * clicking Ship gets: Spotify auto-build when the Spotify field is
 * left blank (a pasted link always wins), then
 * sendDropToSubscribers. `shippedBy` is "Auto-ship" from the cron,
 * or the curator's name from the manual route — purely for the
 * short history line, never changes behavior.
 */
export async function shipDrop(
  club: Club,
  drop: Drop,
  opts: { spotifyUrl?: string | null; appleUrl?: string | null; title?: string | null; shippedBy: string }
): Promise<ShipResult | ShipFailure> {
  let spotifyUrl = opts.spotifyUrl?.trim() || null;
  const appleUrl = opts.appleUrl?.trim() || null;
  const title = opts.title?.trim().toLowerCase() || null;

  let spotifyBuild: Awaited<ReturnType<typeof buildSpotifyPlaylistForDrop>> = null;
  if (!spotifyUrl) {
    const dropSongs = await getDb()
      .select()
      .from(songs)
      .where(eq(songs.dropId, drop.id))
      .orderBy(asc(songs.position), asc(songs.createdAt));
    // `title` wins when this same ship call is also setting a new one
    // (e.g. a curator renames right as they ship); otherwise this drop
    // keeps whatever it was already titled.
    const blurbText = combineDropNotes(await getDropNotes(drop.id));
    spotifyBuild = await buildSpotifyPlaylistForDrop(club, drop.num, title || drop.title, dropSongs, blurbText);
    if (spotifyBuild) spotifyUrl = spotifyBuild.url;
  }

  if (!spotifyUrl && !appleUrl) {
    return {
      ok: false,
      error:
        "Couldn't auto-build a Spotify playlist and no Apple Music link was pasted — paste at least one link to ship.",
    };
  }

  const [updated] = await getDb()
    .update(drops)
    .set({
      ...(spotifyUrl ? { spotifyUrl } : {}),
      ...(appleUrl ? { appleUrl } : {}),
      ...(title ? { title, titleUpdatedBy: opts.shippedBy, titleUpdatedAt: new Date() } : {}),
    })
    .where(eq(drops.id, drop.id))
    .returning();

  const result = await sendDropToSubscribers(updated, opts.shippedBy);

  // Auto-schedule the next drop's open date (2026-10-24 "automate the
  // cycle" round — see claude/next-build.md: a drop that was supposed
  // to auto-ship didn't, and the founder's actual ask was for the
  // whole cycle to run hands-off once it's set up). Only once the ship
  // actually went through — `skipped` means a lost race or a missing
  // playlist link bailed this out before anything really shipped, and
  // Manual stays the one off-switch for all of this automation.
  // schedule-open's own route already guarantees nextDropOpensAt can
  // only ever be set while nothing's open, so this can never clobber a
  // curator's own choice — there wasn't one to make yet.
  if (!("skipped" in result) && club.cycle !== "manual") {
    await getDb()
      .update(clubs)
      .set({ nextDropOpensAt: computeAutoOpenDate() })
      .where(eq(clubs.id, club.id));
  }

  return {
    ok: true,
    dropNum: drop.num,
    ...result,
    spotifyAutoBuild: spotifyBuild
      ? {
          matchedCount: spotifyBuild.matchedCount,
          totalCount: spotifyBuild.totalCount,
          unmatchedTitles: spotifyBuild.unmatchedTitles,
        }
      : null,
  };
}
