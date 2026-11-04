"use client";

import { useEffect, useState } from "react";
import { useSpotifyConnectPopup } from "@/lib/useSpotifyConnectPopup";

// 2026-11-04 — founder's own ask. Dismissing this is remembered per
// browser (localStorage, same spirit as every other per-viewer-only
// convenience on this site) so it doesn't nag a repeat visitor who
// already said no thanks — only ever shown server-side to a logged-in,
// not-yet-connected viewer in the first place (see ReleasesPageContent),
// so there's no "logged out" or "already connected" state to track here.
const DISMISS_KEY = "gz_spotify_banner_dismissed";

/**
 * Quiet prompt under the Releases/home page's stats line (2026-11-04 —
 * founder's own ask: "i want it easier for users to connect their
 * spotify" — see DropDetail's Connect button for the other half of
 * this round, on the drop page itself). Starts hidden and only reveals
 * itself once the dismissed-check below has actually run, so a repeat
 * visitor who already dismissed it never sees a flash of it first.
 */
export default function SpotifyConnectBanner() {
  const { connect, connecting } = useSpotifyConnectPopup();
  const [dismissed, setDismissed] = useState(true);

  // Server-rendered markup has no localStorage to read, so this always
  // starts hidden (`dismissed: true` above) and corrects itself right
  // after mount — same deliberate one-time "don't setState in an
  // effect" exception BrowseSearch.tsx's own remembered-tab hydration
  // uses, for the same reason: there's no external system to subscribe
  // to here, just a value only the browser has.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private window / blocked storage — the dismiss still works for
      // this page view, it just won't be remembered next visit.
    }
  }

  if (dismissed) return null;

  return (
    <div className="spotify-connect-banner">
      <span className="spotify-connect-banner-text">
        <strong>Connect Spotify</strong> for full tracks instead of 30-second previews.
      </span>
      <button type="button" className="link-btn" style={{ fontSize: 11 }} onClick={connect} disabled={connecting}>
        {connecting ? "Connecting…" : "Connect"}
      </button>
      <button type="button" className="spotify-connect-banner-x" onClick={dismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
