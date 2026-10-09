"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import LikeButton from "./LikeButton";
import SongRatingControl from "./SongRatingControl";

/**
 * Site-wide playback (2026-10-08 "drop control + playback" round, then
 * reworked twice more the same general stretch — see
 * claude/next-build.md: "custom bottom player", then this "player
 * revamp — Direction A, queue, shuffle, back/next, loop, like + rate"
 * round). The founder's ask was "clicking the artwork of a song only,
 * it plays from spotify" — a 30-second preview for everyone, full
 * tracks for a visitor who's connected their own Spotify Premium
 * account (src/lib/visitorSpotify.ts, /api/account/spotify/*). One
 * song plays at a time, site-wide, via this single provider mounted
 * once in the root layout — every PlayableArt instance
 * (src/app/_components/PlayableArt.tsx) just calls
 * usePlayer().playFromQueue() and lets this own the actual player.
 *
 * Two totally different playback mechanisms depending on eligibility,
 * not a graceful-degradation of one:
 *   - full: Spotify's Web Playback SDK (lazy-loaded, one reused
 *     Spotify.Player instance) + the Web API's /me/player/play — needs
 *     a connected + Premium visitor. No on-page UI for play/pause/seek
 *     exists for this, so the floating bar below draws its own.
 *   - preview: Spotify's Embed IFrame API
 *     (open.spotify.com/embed/iframe-api/v1), driving one reused,
 *     visually-hidden embed controller — chosen specifically so this
 *     app's own floating bar can draw its own native play/pause
 *     (matching the full-mode bar exactly) instead of showing
 *     Spotify's own visible embed widget.
 *
 * Queue (this round): every PlayableArt instance reads the nearest
 * <PlayQueue> ancestor's song list and hands the FULL list + the
 * clicked index to playFromQueue() — a drop page wraps just its
 * Curator Picks tracklist, /browse wraps its site-wide Songs grid, an
 * artist page wraps that artist's songs, /account wraps the viewer's
 * pick history. A PlayableArt with no <PlayQueue> ancestor (both tabs
 * of the Browse search bar, deliberately — see its own comment) just
 * plays itself as a length-1 queue, same as before this round.
 */

export type PlayableTrack = {
  /** Bare Spotify track id (see src/lib/spotifyId.ts) — never a full
   * spotify:track:<id> URI, every call site here reconstructs that
   * itself where it's needed. */
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  /** The DB songs.id behind this track, when there is one — null for
   * a live Spotify search result that was never a local DB row (the
   * Browse search bar's Spotify tab). Drives the bar's like + rating
   * controls below; a null songId just hides them, nothing to rate. */
  songId: number | null;
};

type PlayMode = "full" | "preview" | null;

type PlayerContextValue = {
  current: PlayableTrack | null;
  /** null while a just-clicked track is still resolving (checking
   * eligibility / connecting to the SDK) — the floating bar shows a
   * plain "loading" state during this window. */
  mode: PlayMode;
  isPlaying: boolean;
  /** The one entry point every PlayableArt calls: the full ordered
   * list it belongs to (its nearest <PlayQueue>, or just itself) plus
   * which index was clicked. Re-clicking whatever's already playing
   * just toggles pause/resume (same as the bar's own button) rather
   * than restarting it — a different track in the list replaces the
   * queue and starts playing. */
  playFromQueue: (tracks: PlayableTrack[], index: number) => void;
  /** The floating bar's own play/pause button, and the bar's artwork
   * thumbnail — always toggles, regardless of mode. */
  toggle: () => void;
  stop: () => void;
  next: () => void;
  back: () => void;
  shuffleOn: boolean;
  toggleShuffle: () => void;
  loopOn: boolean;
  toggleLoop: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

/** Falls back to a harmless no-op rather than throwing if ever called
 * outside the provider — a stray usage shouldn't blank the page. */
export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    return {
      current: null,
      mode: null,
      isPlaying: false,
      playFromQueue: () => {},
      toggle: () => {},
      stop: () => {},
      next: () => {},
      back: () => {},
      shuffleOn: false,
      toggleShuffle: () => {},
      loopOn: false,
      toggleLoop: () => {},
    };
  }
  return ctx;
}

/* ---------- Queue context — what <PlayQueue> hands down to every
 * PlayableArt underneath it ----------
 *
 * Deliberately the same shape PlayableArt already took as individual
 * props (spotifyUri/artworkUrl/title/artist) plus songId, so a page
 * wraps its existing `.map()` in <PlayQueue songs={theSameArray}> and
 * each PlayableArt just gains one songId prop — no separate queue data
 * to keep in sync with what's actually rendered. */

export type QueueSong = {
  spotifyUri: string | null | undefined;
  artworkUrl: string | null | undefined;
  title: string;
  artist: string;
  songId: number | null;
};

const PlayQueueContext = createContext<QueueSong[] | null>(null);

/** Wrap a list of PlayableArt instances in this so clicking any one of
 * them plays through the whole list — shuffle, back, next and the
 * loop-at-the-end all operate on exactly this list, in this order.
 * Omit it (or nest nothing under it) and a PlayableArt just plays
 * itself alone, same as before this round. */
export function PlayQueue({ songs, children }: { songs: QueueSong[]; children: React.ReactNode }) {
  return <PlayQueueContext.Provider value={songs}>{children}</PlayQueueContext.Provider>;
}

export function usePlayQueueSongs(): QueueSong[] | null {
  return useContext(PlayQueueContext);
}

/* ---------- Web Playback SDK — minimal hand-written types ----------
 * No @types package for this SDK; typed just to the handful of methods
 * actually used below rather than pulling in `any`. */

interface SpotifyPlayerState {
  paused: boolean;
  position: number;
  duration: number;
}

interface SpotifyPlayerInstance {
  connect(): Promise<boolean>;
  disconnect(): void;
  togglePlay(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(position_ms: number): Promise<void>;
  addListener(event: "ready" | "not_ready", cb: (data: { device_id: string }) => void): void;
  addListener(
    event: "initialization_error" | "authentication_error" | "account_error" | "playback_error",
    cb: (data: { message: string }) => void
  ): void;
  addListener(event: "player_state_changed", cb: (state: SpotifyPlayerState | null) => void): void;
}

interface SpotifyPlayerConstructor {
  new (options: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }): SpotifyPlayerInstance;
}

/* ---------- Embed IFrame API — minimal hand-written types ----------
 * Same spirit as the SDK types above: typed only to what's actually
 * used (create one controller, swap its track, play/pause/seek it,
 * listen for position updates to notice a preview ending). */

interface SpotifyEmbedPlaybackUpdate {
  data: {
    position: number;
    duration: number;
    isPaused: boolean;
    isBuffering: boolean;
  };
}

interface SpotifyEmbedController {
  loadUri(uri: string): void;
  play(): void;
  pause(): void;
  resume(): void;
  togglePlay(): void;
  seek(seconds: number): void;
  destroy(): void;
  addListener(event: "ready", cb: () => void): void;
  addListener(event: "playback_update", cb: (update: SpotifyEmbedPlaybackUpdate) => void): void;
}

interface SpotifyIframeApi {
  createController(
    element: HTMLElement,
    options: { uri: string; width?: string | number; height?: string | number },
    callback: (controller: SpotifyEmbedController) => void
  ): void;
}

declare global {
  interface Window {
    Spotify?: { Player: SpotifyPlayerConstructor };
    onSpotifyWebPlaybackSDKReady?: () => void;
    onSpotifyIframeApiReady?: (IFrameAPI: SpotifyIframeApi) => void;
  }
}

/** Module-level, not a ref — the SDK script tag and its readiness
 * promise are a true page-wide singleton regardless of how many times
 * this provider itself mounts. */
let sdkLoadPromise: Promise<void> | null = null;

function loadSpotifyPlaybackSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.Spotify) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    script.onerror = () => reject(new Error("Spotify Web Playback SDK failed to load"));
    document.body.appendChild(script);
  });
  return sdkLoadPromise;
}

/** Same page-wide-singleton reasoning as loadSpotifyPlaybackSdk above,
 * for the other Spotify script this file loads. */
let embedApiLoadPromise: Promise<SpotifyIframeApi> | null = null;

function loadSpotifyEmbedApi(): Promise<SpotifyIframeApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (embedApiLoadPromise) return embedApiLoadPromise;

  embedApiLoadPromise = new Promise((resolve) => {
    window.onSpotifyIframeApiReady = (IFrameAPI) => resolve(IFrameAPI);
    const script = document.createElement("script");
    script.src = "https://open.spotify.com/embed/iframe-api/v1";
    script.async = true;
    document.body.appendChild(script);
  });
  return embedApiLoadPromise;
}

/* ---------- Queue order helpers — pure, module-level ----------
 * A "queue" is just the track list a <PlayQueue> handed over, in the
 * order it was rendered. "order" is a permutation of indices into that
 * list — the actual playback order, which is only ever different from
 * 0..n-1 while shuffle is on. */

function sequentialOrder(length: number): number[] {
  return Array.from({ length }, (_, i) => i);
}

/** Shuffles everything except `keepFirst`, which stays at position 0
 * — real Spotify behavior: turning shuffle on doesn't interrupt or
 * reorder the track already playing, only what's still ahead. */
function buildShuffledOrder(length: number, keepFirst: number): number[] {
  const rest: number[] = [];
  for (let i = 0; i < length; i++) {
    if (i !== keepFirst) rest.push(i);
  }
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [keepFirst, ...rest];
}

/** A fresh full shuffle with no track pinned — used when looping back
 * to the start of an already-shuffled queue, so a second lap doesn't
 * replay in the exact same shuffled order as the first. */
function shuffleAll(length: number): number[] {
  const arr = sequentialOrder(length);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Back restarts the current track instead of jumping to the previous
 * one once you're this far into it — matching real Spotify's own
 * threshold. */
const BACK_RESTART_THRESHOLD_MS = 3000;

export default function NowPlayingProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<PlayableTrack | null>(null);
  const [mode, setMode] = useState<PlayMode>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [shuffleOn, setShuffleOn] = useState(false);
  const [loopOn, setLoopOn] = useState(false);

  const playerRef = useRef<SpotifyPlayerInstance | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  // null = not checked yet this session, false = known not eligible
  // (not connected, or Spotify itself says this account isn't
  // Premium — /api/account/spotify/token deliberately collapses both
  // into the same signal, so caching "false" here is safe; see that
  // route's own comment).
  const eligibleRef = useRef<boolean | null>(null);
  // Last-seen full-mode playback state, for the "did it just end
  // naturally" heuristic below — the Web Playback SDK has no
  // dedicated ended event.
  const fullStateRef = useRef<{ position: number; paused: boolean }>({ position: 0, paused: true });

  // One embed controller, reused for every preview this session (just
  // loadUri() to swap tracks) rather than creating a fresh iframe per
  // click — embedHostRef is the hidden <div> it attaches to, always
  // mounted below regardless of whether anything's playing yet.
  const embedHostRef = useRef<HTMLDivElement | null>(null);
  const embedControllerRef = useRef<SpotifyEmbedController | null>(null);
  const embedCreatePromiseRef = useRef<Promise<SpotifyEmbedController> | null>(null);

  // The queue itself — kept in refs, not state, since nothing in the
  // bar's own rendering depends on queue contents or position
  // directly (no "3 of 12" indicator), only on shuffleOn/loopOn above,
  // which are real state. queue = the track list from the <PlayQueue>
  // active when playback last started; order = a permutation of
  // indices into it (the real playback order); pos = where in `order`
  // the current track sits.
  const queueRef = useRef<PlayableTrack[]>([]);
  const orderRef = useRef<number[]>([]);
  const posRef = useRef<number>(-1);
  // Wall-clock time the current track started playing — what back()
  // compares against BACK_RESTART_THRESHOLD_MS. Measured since the
  // track started, not actual listened time (doesn't discount time
  // spent paused) — a deliberate simplification, good enough for "did
  // you just start this or have you been sitting with it a while."
  const trackStartedAtRef = useRef<number>(0);
  // Breaks a real circular dependency (the preview/full "track ended"
  // listeners need to call advance(), which is defined in terms of
  // beginPlayback(), which the listeners are themselves reached
  // through) without pulling half the provider into every callback's
  // dependency array. Kept current via the effect right after
  // handleTrackEnded is defined, below.
  const handleTrackEndedRef = useRef<() => void>(() => {});

  const stop = useCallback((pauseFull: boolean) => {
    if (pauseFull && playerRef.current) {
      playerRef.current.pause().catch(() => {});
    }
    // Always pause the embed controller on stop, full-mode or not —
    // it's reused rather than torn down, so if this didn't run, a
    // preview would keep playing silently behind a closed bar.
    embedControllerRef.current?.pause();
    setCurrent(null);
    setMode(null);
    setIsPlaying(false);
  }, []);

  /** Resolves true only once a device is actually connected and ready
   * to receive a /me/player/play call. Reuses the one Player instance
   * across every track after the first successful connect. */
  const ensureFullPlaybackReady = useCallback(async (): Promise<boolean> => {
    if (eligibleRef.current === false) return false;

    try {
      const res = await fetch("/api/account/spotify/token");
      const data = await res.json();
      if (!data?.premium || !data?.accessToken) {
        eligibleRef.current = false;
        return false;
      }
      accessTokenRef.current = data.accessToken;
      eligibleRef.current = true;
    } catch {
      // A fetch failure here is transient (network blip), not "this
      // account isn't eligible" — don't cache it as ineligible.
      return false;
    }

    if (deviceIdRef.current && playerRef.current) return true;

    try {
      await loadSpotifyPlaybackSdk();
      if (!window.Spotify) return false;

      if (!playerRef.current) {
        const player = new window.Spotify.Player({
          name: "Project Music Club",
          getOAuthToken: (cb) => cb(accessTokenRef.current ?? ""),
          volume: 0.8,
        });
        playerRef.current = player;

        // Full-mode "did the track just end" detection (2026-10-08
        // player revamp — see claude/next-build.md): the Web Playback
        // SDK has no dedicated ended event, so this treats "was
        // progressing, now paused right near position 0" as a natural
        // end rather than a deliberate pause — which is what it looks
        // like for a single queued URI, since this app never pushes a
        // real Spotify-side queue (see beginPlayback below). Also
        // keeps isPlaying honest if Spotify itself pauses for a reason
        // this tab didn't cause — previously nothing listened to real
        // SDK state at all. Not verified against a live Premium
        // session (standing sandbox limitation — no real Spotify
        // account reachable here); flag for the founder to confirm
        // once this ships.
        player.addListener("player_state_changed", (state) => {
          if (!state) return;
          setIsPlaying(!state.paused);
          const prev = fullStateRef.current;
          fullStateRef.current = { position: state.position, paused: state.paused };
          if (!prev.paused && state.paused && state.position < 1000 && prev.position > 2000) {
            handleTrackEndedRef.current();
          }
        });

        await new Promise<void>((resolve, reject) => {
          player.addListener("ready", ({ device_id }) => {
            deviceIdRef.current = device_id;
            resolve();
          });
          player.addListener("not_ready", () => {
            deviceIdRef.current = null;
          });
          player.addListener("initialization_error", () => reject(new Error("init failed")));
          player.addListener("authentication_error", () => reject(new Error("auth failed")));
          player.addListener("account_error", () => reject(new Error("account failed")));
          player.connect();
        });
      }
      return !!deviceIdRef.current;
    } catch {
      // Connecting the SDK itself failed (blocked script, expired
      // token mid-handshake, etc.) — fall back to preview rather than
      // permanently marking this visitor ineligible.
      return false;
    }
  }, []);

  /** Position updates double as this preview's only "did it end"
   * signal — the embed API has no separate ended event. */
  const attachPreviewListeners = useCallback((controller: SpotifyEmbedController) => {
    controller.addListener("playback_update", ({ data }) => {
      setIsPlaying(!data.isPaused);
      if (data.duration > 0 && data.position >= data.duration - 0.3) {
        // Preview reached its end — advance the queue (2026-10-08
        // player revamp — see claude/next-build.md) instead of just
        // closing the bar; advance() itself closes the bar when
        // there's nothing left to play and looping is off, same as
        // the old behavior for a single track with no queue.
        handleTrackEndedRef.current();
      }
    });
  }, []);

  /** Creates the one reused embed controller the first time it's
   * needed, attached to the always-mounted hidden host div below.
   * Later calls just hand back the same in-flight/resolved promise —
   * the `uri` passed in only ever seeds the controller's FIRST track;
   * every real play still goes through loadUri() in startPreview
   * below. Listeners are attached exactly once, right here, rather
   * than by every caller that happens to be the one to create the
   * controller. */
  const createEmbedController = useCallback(
    (uri: string): Promise<SpotifyEmbedController> => {
      if (embedCreatePromiseRef.current) return embedCreatePromiseRef.current;

      embedCreatePromiseRef.current = loadSpotifyEmbedApi().then(
        (IFrameAPI) =>
          new Promise<SpotifyEmbedController>((resolve, reject) => {
            if (!embedHostRef.current) {
              reject(new Error("no embed host element"));
              return;
            }
            IFrameAPI.createController(embedHostRef.current, { uri, width: 1, height: 1 }, (controller) => {
              embedControllerRef.current = controller;
              attachPreviewListeners(controller);
              resolve(controller);
            });
          })
      );
      return embedCreatePromiseRef.current;
    },
    [attachPreviewListeners]
  );

  /** Loads + plays a track through the embed controller, creating it
   * on first use. Always ends with an explicit play() — loadUri()
   * alone doesn't reliably autoplay the newly-loaded track. */
  const startPreview = useCallback(
    async (track: PlayableTrack) => {
      const uri = `spotify:track:${track.id}`;
      const controller = embedControllerRef.current ?? (await createEmbedController(uri));

      // Always load THIS call's own uri, even when the controller
      // already existed, or was still mid-creation for an earlier
      // click's uri when this call started — createEmbedController's
      // promise only seeds the controller's initial track.
      controller.loadUri(uri);
      controller.play();
      setMode("preview");
      setIsPlaying(true);
    },
    [createEmbedController]
  );

  /** Actually starts playing a track — full mode if this visitor is
   * eligible and the request succeeds, preview otherwise. Does NOT
   * touch the queue/order/pos refs; callers (playFromQueue, advance)
   * set those up first, this just does the mechanical "go play this
   * track" work both of them share. */
  const beginPlayback = useCallback(
    (track: PlayableTrack) => {
      // Pause whatever the embed controller was doing first so a
      // mid-flight preview can't keep playing underneath while the
      // new track resolves.
      embedControllerRef.current?.pause();

      setCurrent(track);
      setMode(null);
      setIsPlaying(false);
      trackStartedAtRef.current = Date.now();

      (async () => {
        const ready = await ensureFullPlaybackReady();
        if (ready && deviceIdRef.current && accessTokenRef.current) {
          try {
            const res = await fetch(
              `https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`,
              {
                method: "PUT",
                headers: {
                  Authorization: `Bearer ${accessTokenRef.current}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ uris: [`spotify:track:${track.id}`] }),
              }
            );
            if (res.ok) {
              setMode("full");
              setIsPlaying(true);
              return;
            }
          } catch {
            // fall through to preview
          }
        }
        try {
          await startPreview(track);
        } catch {
          // Couldn't even get a preview going — don't leave the bar
          // stuck showing "Loading…" forever.
          stop(false);
        }
      })();
    },
    [ensureFullPlaybackReady, startPreview, stop]
  );

  /** The floating bar's own play/pause button, and (as of this round)
   * the bar's own artwork thumbnail and a PlayableArt re-clicked on
   * whatever's already playing — always a toggle, whichever mode is
   * active. */
  const toggle = useCallback(() => {
    if (mode === "full" && playerRef.current) {
      playerRef.current.togglePlay().catch(() => {});
      setIsPlaying((p) => !p);
    } else if (mode === "preview" && embedControllerRef.current) {
      embedControllerRef.current.togglePlay();
      setIsPlaying((p) => !p);
    }
  }, [mode]);

  /** Seeks the current track back to 0 and keeps it playing — what
   * back() does once you're a few seconds into a track, instead of
   * jumping to the previous one. */
  const restartCurrent = useCallback(() => {
    trackStartedAtRef.current = Date.now();
    if (mode === "full" && playerRef.current) {
      playerRef.current.seek(0).catch(() => {});
      playerRef.current.resume().catch(() => {});
      setIsPlaying(true);
    } else if (mode === "preview" && embedControllerRef.current) {
      embedControllerRef.current.seek(0);
      embedControllerRef.current.play();
      setIsPlaying(true);
    }
  }, [mode]);

  /** next()/back()/the natural-end handlers all funnel through here.
   * direction 1 = next, -1 = back. */
  const advance = useCallback(
    (direction: 1 | -1) => {
      const queue = queueRef.current;
      if (queue.length === 0) return;

      if (direction === -1) {
        const elapsed = Date.now() - trackStartedAtRef.current;
        if (elapsed > BACK_RESTART_THRESHOLD_MS) {
          restartCurrent();
          return;
        }
        const newPos = posRef.current - 1;
        if (newPos < 0) {
          if (loopOn) {
            posRef.current = orderRef.current.length - 1;
            beginPlayback(queue[orderRef.current[posRef.current]]);
          } else {
            // Nothing earlier to go to and not looping — same as real
            // Spotify, back() at the very start of the queue just
            // restarts the first track instead of doing nothing.
            restartCurrent();
          }
          return;
        }
        posRef.current = newPos;
        beginPlayback(queue[orderRef.current[newPos]]);
        return;
      }

      let newPos = posRef.current + 1;
      if (newPos >= orderRef.current.length) {
        if (!loopOn) {
          stop(false);
          return;
        }
        // Looping back to the start — a fresh shuffle for the new lap
        // if shuffle's on, so it doesn't replay in the exact same
        // order (real Spotify behavior).
        if (shuffleOn) orderRef.current = shuffleAll(queue.length);
        newPos = 0;
      }
      posRef.current = newPos;
      beginPlayback(queue[orderRef.current[newPos]]);
    },
    [loopOn, shuffleOn, beginPlayback, restartCurrent, stop]
  );

  const next = useCallback(() => advance(1), [advance]);
  const back = useCallback(() => advance(-1), [advance]);
  const handleTrackEnded = useCallback(() => advance(1), [advance]);

  useEffect(() => {
    handleTrackEndedRef.current = handleTrackEnded;
  }, [handleTrackEnded]);

  /** The one entry point PlayableArt calls — see PlayerContextValue's
   * own comment. */
  const playFromQueue = useCallback(
    (tracks: PlayableTrack[], index: number) => {
      if (tracks.length === 0) return;
      const clampedIndex = Math.min(Math.max(index, 0), tracks.length - 1);
      const track = tracks[clampedIndex];

      if (current?.id === track.id) {
        toggle();
        return;
      }

      queueRef.current = tracks;
      if (shuffleOn) {
        orderRef.current = buildShuffledOrder(tracks.length, clampedIndex);
        posRef.current = 0;
      } else {
        orderRef.current = sequentialOrder(tracks.length);
        posRef.current = clampedIndex;
      }
      beginPlayback(track);
    },
    [current, shuffleOn, toggle, beginPlayback]
  );

  /** Shuffle only ever reorders what's left in the queue — the track
   * already playing keeps playing, uninterrupted, same as real
   * Spotify. */
  const toggleShuffle = useCallback(() => {
    setShuffleOn((on) => {
      const next = !on;
      const queue = queueRef.current;
      if (queue.length > 0) {
        const currentIndex = orderRef.current[posRef.current] ?? 0;
        orderRef.current = next ? buildShuffledOrder(queue.length, currentIndex) : sequentialOrder(queue.length);
        posRef.current = next ? 0 : currentIndex;
      }
      return next;
    });
  }, []);

  const toggleLoop = useCallback(() => setLoopOn((on) => !on), []);

  return (
    <PlayerContext.Provider
      value={{
        current,
        mode,
        isPlaying,
        playFromQueue,
        toggle,
        stop: () => stop(true),
        next,
        back,
        shuffleOn,
        toggleShuffle,
        loopOn,
        toggleLoop,
      }}
    >
      {children}

      {/* Hidden host for Spotify's Embed IFrame API — drives real
          preview audio invisibly so the floating bar below can draw
          its own native play/pause instead of Spotify's visible embed
          widget. Not display:none — some browsers suspend media
          inside a display:none iframe — just clipped to nothing and
          click-through. Always mounted (not conditional on `current`)
          so the one controller, once created, persists across every
          track change. */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          bottom: 0,
          right: 0,
          width: 1,
          height: 1,
          opacity: 0,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <div ref={embedHostRef} />
      </div>

      {current && <NowPlayingBar track={current} />}
    </PlayerContext.Provider>
  );
}

/** The current track's like + 1-5 rating, reusing the exact same
 * LikeButton/SongRatingControl every track row on the site already
 * uses — just fetched fresh (src/app/api/account/song-status) for
 * whatever's current, since the bar is global and a track can become
 * "current" via next/back/natural-advance with no rendered row nearby
 * to have handed it initial values. `key={songId}` on the call site
 * forces a full remount per track — both components only read their
 * initial* props once, on mount, so without the remount a track
 * change would keep showing the PREVIOUS track's like/rating state
 * until clicked. */
function NowPlayingRating({ songId }: { songId: number }) {
  const [status, setStatus] = useState<{
    liked: boolean;
    likeCount: number;
    rating: number | null;
    ratingAverage: number | null;
    ratingCount: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/account/song-status?songId=${songId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setStatus(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [songId]);

  if (!status) return <div className="now-playing-rate" aria-hidden="true" />;

  return (
    <div className="now-playing-rate">
      <LikeButton songId={songId} initialLiked={status.liked} initialCount={status.likeCount} />
      <SongRatingControl
        songId={songId}
        initialRating={status.rating}
        initialAverage={status.ratingAverage}
        initialCount={status.ratingCount}
      />
    </div>
  );
}

function NowPlayingBar({ track }: { track: PlayableTrack }) {
  const { mode, isPlaying, toggle, shuffleOn, toggleShuffle, loopOn, toggleLoop, next, back, stop } = usePlayer();
  const loading = mode === null;

  return (
    <div className="now-playing-bar" role="region" aria-label="Now playing">
      <button
        type="button"
        className="now-playing-art-btn"
        onClick={toggle}
        aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
      >
        {track.artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.artworkUrl} alt="" className="now-playing-art" />
        ) : (
          <div className="now-playing-art now-playing-art-empty" aria-hidden="true" />
        )}
        {isPlaying && (
          <span className="now-playing-art-overlay" aria-hidden="true">
            <PauseIcon size={13} />
          </span>
        )}
      </button>

      <div className="now-playing-info">
        <div className="now-playing-title">{track.title}</div>
        <div className="now-playing-artist">{track.artist}</div>
      </div>

      {loading && <span className="mut now-playing-status">Loading…</span>}

      {track.songId != null && <NowPlayingRating key={track.songId} songId={track.songId} />}

      <div className="now-playing-divider" aria-hidden="true" />

      <button
        type="button"
        className={`now-playing-transport-btn${shuffleOn ? " active" : ""}`}
        onClick={toggleShuffle}
        aria-label="Shuffle"
        aria-pressed={shuffleOn}
      >
        <ShuffleIcon size={13} />
      </button>

      <button type="button" className="now-playing-transport-btn" onClick={back} aria-label="Previous">
        <SkipBackIcon size={14} />
      </button>

      {!loading && (
        <button
          type="button"
          className="now-playing-btn"
          onClick={toggle}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
        </button>
      )}

      <button type="button" className="now-playing-transport-btn" onClick={next} aria-label="Next">
        <SkipForwardIcon size={14} />
      </button>

      <button
        type="button"
        className={`now-playing-transport-btn${loopOn ? " active" : ""}`}
        onClick={toggleLoop}
        aria-label="Loop"
        aria-pressed={loopOn}
      >
        <LoopIcon size={13} />
      </button>

      <div className="now-playing-divider" aria-hidden="true" />

      <button type="button" className="now-playing-close" onClick={stop} aria-label="Close player">
        <CloseIcon size={11} />
      </button>
    </div>
  );
}

/* ---------- Inline icons — stroke/geometric, no icon library ---------- */

function PlayIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" />
      <rect x="14" y="5" width="4" height="14" />
    </svg>
  );
}

function ShuffleIcon({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  );
}

function SkipBackIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <polygon points="19 20 9 12 19 4 19 20" />
      <rect x="5" y="4" width="2" height="16" />
    </svg>
  );
}

function SkipForwardIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <polygon points="5 4 15 12 5 20 5 4" />
      <rect x="17" y="4" width="2" height="16" />
    </svg>
  );
}

function LoopIcon({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function CloseIcon({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="4" y1="4" x2="20" y2="20" />
      <line x1="20" y1="4" x2="4" y2="20" />
    </svg>
  );
}
