"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Shared popup-based Spotify connect flow (2026-11-04 — founder's own
 * ask, after noticing the existing Account-page "Connect Spotify" link
 * always fully navigates the tab away to Spotify's OAuth screen, which
 * kills whatever NowPlayingProvider has playing, same as any other hard
 * reload — see AccountBoard.tsx's own comment on why that link has to
 * be a real `<a>`). Both the drop page's Connect button and the
 * Releases banner use this instead, so connecting never touches the
 * current tab at all.
 *
 * /api/account/spotify/connect still kicks off the exact same real
 * Spotify OAuth redirect as before — this just does it inside a popup
 * window (?popup=1 tells /api/account/spotify/callback to render a
 * tiny self-closing page instead of redirecting to /account — see that
 * route's own comment). On success this calls router.refresh() so the
 * server-computed "is this viewer connected" props catch up (the
 * Connect button/banner disappearing, Share going back to full width)
 * without ever navigating the page that's actually playing anything.
 */
export function useSpotifyConnectPopup() {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);

  const connect = useCallback(() => {
    setConnecting(true);

    const popup = window.open(
      "/api/account/spotify/connect?popup=1",
      "spotify-connect",
      "width=480,height=680"
    );

    // Popup blocked — fall back to the old same-tab redirect rather
    // than leaving the button stuck on "Connecting…" forever. This
    // visitor just gets the pre-popup behavior (playback stops), same
    // as the Account page's own button always has. A real full
    // navigation to an API route that immediately 302s to Spotify's own
    // OAuth screen — not an internal page router.push could handle.
    if (!popup) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/api/account/spotify/connect";
      return;
    }

    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if ((e.data as { source?: string } | null)?.source !== "gz-spotify-connect") return;
      cleanup();
      setConnecting(false);
      const status = (e.data as { status?: string }).status;
      if (status === "connected") router.refresh();
    }
    window.addEventListener("message", onMessage);

    // Belt-and-suspenders: the visitor can just close the popup by
    // hand with no message ever sent (declined without hitting
    // Spotify's own cancel redirect, browser quirk, etc.) — poll so
    // the button doesn't stay stuck on "Connecting…" forever.
    const poll: ReturnType<typeof setInterval> = setInterval(() => {
      if (popup.closed) {
        cleanup();
        setConnecting(false);
      }
    }, 500);

    function cleanup() {
      window.removeEventListener("message", onMessage);
      clearInterval(poll);
    }
  }, [router]);

  return { connect, connecting };
}
