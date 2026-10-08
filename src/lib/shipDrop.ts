import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops, songs, type Club, type Drop } from "@/db/schema";
import { sendDropToSubscribers } from "./release";
import { buildSpotifyPlaylistForDrop } from "./spotifyBuild";

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
  const title = opts.title?.trim() || null;

  let spotifyBuild: Awaited<ReturnType<typeof buildSpotifyPlaylistForDrop>> = null;
  if (!spotifyUrl) {
    const dropSongs = await getDb()
      .select()
      .from(songs)
      .where(eq(songs.dropId, drop.id))
      .orderBy(asc(songs.position), asc(songs.createdAt));
    spotifyBuild = await buildSpotifyPlaylistForDrop(club, drop.num, dropSongs);
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
