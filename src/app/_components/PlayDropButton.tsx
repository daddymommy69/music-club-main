"use client";

import { usePlayer, type QueueSong, type PlayableTrack } from "./NowPlayingProvider";
import { spotifyTrackIdFromUri } from "@/lib/spotifyId";

/**
 * Prominent "play this drop" button for the drop-detail modal (2026-10-09
 * design-pass round — see claude/next-build.md). Jacob's own ask after
 * seeing the modal screenshot: "no clear primary action" — clicking a
 * tiny per-track artwork icon was the only way in before this. Plays the
 * exact same Curator Picks queue PlayableArt already builds (same
 * spotifyTrackIdFromUri resolution, same skip-unplayable-tracks rule),
 * starting from the first playable track.
 *
 * Shares play state with every PlayableArt on the page through the one
 * usePlayer() context, so clicking a track row afterward (or clicking
 * this button again) just toggles the same player rather than starting a
 * second one — this button simply shows "Pause" instead of "Play" while
 * this exact queue is already the one playing.
 */
export default function PlayDropButton({ songs }: { songs: QueueSong[] }) {
  const { current, mode, isPlaying, playFromQueue, toggle } = usePlayer();

  const resolved: PlayableTrack[] = [];
  for (const s of songs) {
    const id = spotifyTrackIdFromUri(s.spotifyUri);
    if (!id) continue; // not playable — same skip rule as PlayableArt
    resolved.push({ id, title: s.title, artist: s.artist, artworkUrl: s.artworkUrl ?? null, songId: s.songId });
  }

  if (resolved.length === 0) return null; // nothing playable in this drop at all

  const isThisQueuePlaying = mode !== null && !!current && resolved.some((t) => t.id === current.id);

  function handleClick() {
    if (isThisQueuePlaying) {
      toggle();
      return;
    }
    playFromQueue(resolved, 0);
  }

  return (
    <button type="button" className="btn btn-primary play-drop-btn" onClick={handleClick}>
      {isThisQueuePlaying && isPlaying ? "❙❙ Pause" : "▶ Play this drop"}
    </button>
  );
}
