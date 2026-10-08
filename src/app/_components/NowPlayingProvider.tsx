"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

/**
 * Site-wide playback (2026-10-08 "drop control + playback" round — see
 * claude/next-build.md). The founder's ask was "clicking the artwork
 * of a song only, it plays from spotify" — a 30-second preview for
 * everyone, full tracks for a visitor who's connected their own
 * Spotify Premium account (src/lib/visitorSpotify.ts,
 * /api/account/spotify/*). One song plays at a time, site-wide, via
 * this single provider mounted once in the root layout — every
 * PlayableArt instance (src/app/_components/PlayableArt.tsx) just
 * calls usePlayer().play() and lets this own the actual player.
 *
 * Deliberately two totally different playback mechanisms depending on
 * eligibility, not a graceful-degradation of one:
 *   - full: Spotify's Web Playback SDK (lazy-loaded, one reused
 *     Spotify.Player instance) + the Web API's /me/player/play — needs
 *     a connected + Premium visitor. No on-page UI for play/pause/seek
 *     exists for this, so the floating bar below draws its own.
 *   - preview: Spotify's own compact embed widget
 *     (open.spotify.com/embed/track/<id>) — chosen specifically because
 *     it ships its own play/pause/seek chrome, so this file never has
 *     to speak Spotify's postMessage IFrame API to control it. The
 *     floating bar just mounts/unmounts the iframe.
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
  play: (track: PlayableTrack) => void;
  stop: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

/** Falls back to a harmless no-op rather than throwing if ever called
 * outside the provider — a stray usage shouldn't blank the page. */
export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    return { current: null, mode: null, isPlaying: false, play: () => {}, stop: () => {} };
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

declare global {
  interface Window {
    Spotify?: { Player: SpotifyPlayerConstructor };
    onSpotifyWebPlaybackSDKReady?: () => void;
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

  const stop = useCallback((pauseFull: boolean) => {
    if (pauseFull && playerRef.current) {
      playerRef.current.pause().catch(() => {});
    }
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

  const play = useCallback(
    (track: PlayableTrack) => {
      if (current?.id === track.id) {
        if (mode === "full" && playerRef.current) {
          playerRef.current.togglePlay().catch(() => {});
          setIsPlaying((p) => !p);
        } else if (mode === "preview") {
          stop(false);
        }
        return;
      }

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
        setMode("preview");
        setIsPlaying(true);
      })();
    },
    [current, mode, stop, ensureFullPlaybackReady]
  );

  return (
    <PlayerContext.Provider value={{ current, mode, isPlaying, play, stop: () => stop(true) }}>
      {children}
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
  const { play } = usePlayer();

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

      {mode === "full" && (
        <button
          type="button"
          className="now-playing-btn"
          onClick={() => play(track)}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "❙❙" : "▶"}
        </button>
      )}

      {mode === "preview" && (
        <iframe
          title="Spotify preview"
          src={`https://open.spotify.com/embed/track/${track.id}?theme=0`}
          width="240"
          height="80"
          style={{ border: 0, borderRadius: 8 }}
          allow="autoplay; encrypted-media; clipboard-write"
          loading="lazy"
        />
      )}

      <button type="button" className="now-playing-close" onClick={onStop} aria-label="Close player">
        ✕
      </button>
    </div>
  );
}
