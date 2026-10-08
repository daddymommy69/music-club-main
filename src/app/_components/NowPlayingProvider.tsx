"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

/**
 * Site-wide playback (2026-10-08 "drop control + playback" round, then
 * reworked the same day in the "custom bottom player" round — see
 * claude/next-build.md). The founder's ask was "clicking the artwork
 * of a song only, it plays from spotify" — a 30-second preview for
 * everyone, full tracks for a visitor who's connected their own
 * Spotify Premium account (src/lib/visitorSpotify.ts,
 * /api/account/spotify/*). One song plays at a time, site-wide, via
 * this single provider mounted once in the root layout — every
 * PlayableArt instance (src/app/_components/PlayableArt.tsx) just
 * calls usePlayer().play() and lets this own the actual player.
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
 *     Spotify's own visible embed widget (2026-10-08 — founder's own
 *     report: "i dont want it to open an embed... if possible... a
 *     bottom player, like how it plays on spotify"). No progress/seek
 *     UI either mode — re-clicking the SAME track's artwork restarts
 *     its preview from 0 rather than toggling it off; the floating
 *     bar's own button toggles play/pause instead, same as full mode.
 */

export type PlayableTrack = {
  /** Bare Spotify track id (see src/lib/spotifyId.ts) — never a full
   * spotify:track:<id> URI, every call site here reconstructs that
   * itself where it's needed. */
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
};

type PlayMode = "full" | "preview" | null;

type PlayerContextValue = {
  current: PlayableTrack | null;
  /** null while a just-clicked track is still resolving (checking
   * eligibility / connecting to the SDK) — the floating bar shows a
   * plain "loading" state during this window. */
  mode: PlayMode;
  isPlaying: boolean;
  /** Artwork's click handler — same track again restarts its preview
   * (full mode: toggles, same as the bar's own button). A different
   * track loads and plays it, full or preview, whichever this visitor
   * is eligible for. */
  play: (track: PlayableTrack) => void;
  /** The floating bar's own play/pause button — always toggles,
   * regardless of mode. Separate from play() above on purpose, so
   * re-clicking the artwork and clicking the bar's button can mean
   * different things for a preview (restart vs. pause/resume). */
  toggle: () => void;
  stop: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

/** Falls back to a harmless no-op rather than throwing if ever called
 * outside the provider — a stray usage shouldn't blank the page. */
export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    return { current: null, mode: null, isPlaying: false, play: () => {}, toggle: () => {}, stop: () => {} };
  }
  return ctx;
}

/* ---------- Web Playback SDK — minimal hand-written types ----------
 * No @types package for this SDK; typed just to the handful of methods
 * actually used below rather than pulling in `any`. */

interface SpotifyPlayerInstance {
  connect(): Promise<boolean>;
  disconnect(): void;
  togglePlay(): Promise<void>;
  pause(): Promise<void>;
  addListener(event: "ready" | "not_ready", cb: (data: { device_id: string }) => void): void;
  addListener(
    event: "initialization_error" | "authentication_error" | "account_error" | "playback_error",
    cb: (data: { message: string }) => void
  ): void;
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

export default function NowPlayingProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<PlayableTrack | null>(null);
  const [mode, setMode] = useState<PlayMode>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const playerRef = useRef<SpotifyPlayerInstance | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  // null = not checked yet this session, false = known not eligible
  // (not connected, or Spotify itself says this account isn't
  // Premium — /api/account/spotify/token deliberately collapses both
  // into the same signal, so caching "false" here is safe; see that
  // route's own comment).
  const eligibleRef = useRef<boolean | null>(null);

  // One embed controller, reused for every preview this session (just
  // loadUri() to swap tracks) rather than creating a fresh iframe per
  // click — embedHostRef is the hidden <div> it attaches to, always
  // mounted below regardless of whether anything's playing yet.
  const embedHostRef = useRef<HTMLDivElement | null>(null);
  const embedControllerRef = useRef<SpotifyEmbedController | null>(null);
  const embedCreatePromiseRef = useRef<Promise<SpotifyEmbedController> | null>(null);

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
   * signal — the embed API has no separate ended event. Also keeps
   * isPlaying honest if Spotify itself pauses/buffers for a reason
   * this tab didn't cause. */
  const attachPreviewListeners = useCallback(
    (controller: SpotifyEmbedController) => {
      controller.addListener("playback_update", ({ data }) => {
        setIsPlaying(!data.isPaused);
        if (data.duration > 0 && data.position >= data.duration - 0.3) {
          // Preview reached its end — close the bar entirely, same as
          // the visitor hitting ✕, rather than leaving it sitting there
          // paused at the end (2026-10-08 — see claude/next-build.md).
          stop(false);
        }
      });
    },
    [stop]
  );

  /** Creates the one reused embed controller the first time it's
   * needed, attached to the always-mounted hidden host div below.
   * Later calls just hand back the same in-flight/resolved promise —
   * the `uri` passed in only ever seeds the controller's FIRST track;
   * every real play still goes through loadUri() in startPreview
   * below, which is what keeps a second track clicked while this is
   * still resolving from silently losing the race (see startPreview's
   * own comment). Listeners are attached exactly once, right here,
   * rather than by every caller that happens to be the one to create
   * the controller (2026-10-08 audit fix — see claude/next-build.md):
   * the earlier version attached them again whenever a concurrent
   * startPreview() call saw embedControllerRef.current still null and
   * went through the "create" branch too, double-firing the
   * preview-ended handler. */
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
      // click's uri when this call started (2026-10-08 audit fix — see
      // claude/next-build.md). createEmbedController's promise is
      // shared across concurrent calls and only seeds the controller's
      // initial track — without this, clicking a second track before
      // the first one finished creating the controller left the bar
      // showing the second track while the first one's audio kept
      // playing underneath it.
      controller.loadUri(uri);
      controller.play();
      setMode("preview");
      setIsPlaying(true);
    },
    [createEmbedController]
  );

  const play = useCallback(
    (track: PlayableTrack) => {
      if (current?.id === track.id) {
        if (mode === "full" && playerRef.current) {
          playerRef.current.togglePlay().catch(() => {});
          setIsPlaying((p) => !p);
        } else if (mode === "preview" && embedControllerRef.current) {
          // Re-clicking the same track's artwork restarts its preview
          // from 0 rather than toggling it off (2026-10-08 — founder's
          // own call: "click should restart it") — the bar's own
          // button (toggle(), below) is where pause/resume lives now.
          embedControllerRef.current.seek(0);
          embedControllerRef.current.play();
          setIsPlaying(true);
        }
        return;
      }

      // Switching to a different track — pause whatever the embed
      // controller was doing first so a mid-flight preview can't keep
      // playing underneath while the new track resolves.
      embedControllerRef.current?.pause();

      setCurrent(track);
      setMode(null);
      setIsPlaying(false);

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
    [current, mode, stop, ensureFullPlaybackReady, startPreview]
  );

  /** The floating bar's own play/pause button — always a toggle,
   * whichever mode is active. Deliberately separate from play() above
   * (see its own comment). */
  const toggle = useCallback(() => {
    if (mode === "full" && playerRef.current) {
      playerRef.current.togglePlay().catch(() => {});
      setIsPlaying((p) => !p);
    } else if (mode === "preview" && embedControllerRef.current) {
      embedControllerRef.current.togglePlay();
      setIsPlaying((p) => !p);
    }
  }, [mode]);

  return (
    <PlayerContext.Provider value={{ current, mode, isPlaying, play, toggle, stop: () => stop(true) }}>
      {children}

      {/* Hidden host for Spotify's Embed IFrame API (2026-10-08 — see
          claude/next-build.md): drives real preview audio invisibly so
          the floating bar below can draw its own native play/pause
          instead of Spotify's visible embed widget. Not display:none —
          some browsers suspend media inside a display:none iframe —
          just clipped to nothing and click-through. Always mounted
          (not conditional on `current`) so the one controller, once
          created, persists across every track change. */}
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

      {current && <NowPlayingBar track={current} mode={mode} isPlaying={isPlaying} onStop={() => stop(true)} />}
    </PlayerContext.Provider>
  );
}

function NowPlayingBar({
  track,
  mode,
  isPlaying,
  onStop,
}: {
  track: PlayableTrack;
  mode: PlayMode;
  isPlaying: boolean;
  onStop: () => void;
}) {
  const { toggle } = usePlayer();

  return (
    <div className="now-playing-bar" role="region" aria-label="Now playing">
      {track.artworkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={track.artworkUrl} alt="" className="now-playing-art" />
      ) : (
        <div className="now-playing-art now-playing-art-empty" aria-hidden="true" />
      )}

      <div className="now-playing-info">
        <div className="now-playing-title">{track.title}</div>
        <div className="now-playing-artist">{track.artist}</div>
      </div>

      {mode === null && <span className="mut now-playing-status">Loading…</span>}

      {/* Same native play/pause control either mode now — full and
          preview both just toggle here (2026-10-08 — the founder's own
          ask: a custom bottom player "like how it plays on spotify"
          instead of Spotify's visible preview embed). No progress/seek
          UI in either mode, matching how the full-mode bar always
          looked. */}
      {(mode === "full" || mode === "preview") && (
        <button
          type="button"
          className="now-playing-btn"
          onClick={toggle}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "❙❙" : "▶"}
        </button>
      )}

      <button type="button" className="now-playing-close" onClick={onStop} aria-label="Close player">
        ✕
      </button>
    </div>
  );
}
