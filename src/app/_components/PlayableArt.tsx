"use client";

import FallbackImg from "./FallbackImg";
import { usePlayer, usePlayQueueSongs, type PlayableTrack } from "./NowPlayingProvider";
import { spotifyTrackIdFromUri } from "@/lib/spotifyId";

/**
 * Clickable artwork that plays through NowPlayingProvider's floating
 * bar (2026-10-08 "drop control + playback" round — see
 * claude/next-build.md): the founder's own ask, "clicking the artwork
 * of a song only, it plays from spotify." A play/pause icon only shows
 * on hover/focus ("maybe when scrolled upon the play button will
 * show") — at rest this looks exactly like the plain artwork every
 * other spot on the site already renders.
 *
 * Deliberately NOT a link — DropDetail used to wrap artwork in a link
 * to the song's artist page; now that artwork's click target is play,
 * that's the title/artist TEXT's job instead. Wire a separate <Link>
 * next to wherever this is used (see artistHref).
 *
 * Renders a plain static image with no play affordance at all when
 * there's no resolved Spotify id (Apple-only pick, or auto-build never
 * found a match) — nothing to play, so this never pretends otherwise.
 *
 * Queue (player revamp round — see claude/next-build.md): when a
 * <PlayQueue> ancestor exists, clicking plays through its FULL song
 * list, not just this one track — shuffle/back/next/loop all then
 * operate on that list, in the order it was rendered. With no
 * <PlayQueue> ancestor (BrowseSearch's two tabs, deliberately — see
 * its own comment), this just plays itself alone, same as before that
 * round.
 */
export default function PlayableArt({
  spotifyUri,
  artworkUrl,
  title,
  artist,
  songId,
  className = "track-row-art",
  fallbackClassName = "track-row-art track-row-art-empty",
}: {
  spotifyUri: string | null | undefined;
  artworkUrl: string | null | undefined;
  title: string;
  artist: string;
  /** The DB songs.id behind this track, or null when there isn't one
   * yet (a live Spotify search result not yet in the DB) — see
   * PlayableTrack's own comment. */
  songId: number | null;
  className?: string;
  fallbackClassName?: string;
}) {
  const { current, mode, playFromQueue } = usePlayer();
  const queueSongs = usePlayQueueSongs();
  const trackId = spotifyTrackIdFromUri(spotifyUri);
  const isThisTrack = !!trackId && current?.id === trackId;
  const isPlayingThis = isThisTrack && mode !== null;

  const art = artworkUrl ? (
    <FallbackImg src={artworkUrl} alt="" className={className} fallbackClassName={fallbackClassName} />
  ) : (
    <div className={fallbackClassName} aria-hidden="true" />
  );

  if (!trackId) {
    return <div className="playable-art">{art}</div>;
  }

  function handleClick() {
    if (!trackId) return;
    const myTrack: PlayableTrack = { id: trackId, title, artist, artworkUrl: artworkUrl ?? null, songId };

    if (!queueSongs || queueSongs.length === 0) {
      playFromQueue([myTrack], 0);
      return;
    }

    const resolved: PlayableTrack[] = [];
    let myIndex = -1;
    for (const s of queueSongs) {
      const id = spotifyTrackIdFromUri(s.spotifyUri);
      if (!id) continue; // not playable — never part of the clickable queue
      if (myIndex === -1 && (s.songId != null ? s.songId === songId : id === trackId)) {
        myIndex = resolved.length;
      }
      resolved.push({ id, title: s.title, artist: s.artist, artworkUrl: s.artworkUrl ?? null, songId: s.songId });
    }
    playFromQueue(resolved, myIndex >= 0 ? myIndex : 0);
  }

  return (
    <button
      type="button"
      className="playable-art playable-art-active"
      onClick={handleClick}
      aria-label={isPlayingThis ? `Pause ${title}` : `Play ${title}`}
      aria-pressed={isPlayingThis}
    >
      {art}
      <span className={`playable-art-icon${isPlayingThis ? " is-playing" : ""}`} aria-hidden="true">
        {isPlayingThis ? "❙❙" : "▶"}
      </span>
    </button>
  );
}

export type { PlayableTrack };
