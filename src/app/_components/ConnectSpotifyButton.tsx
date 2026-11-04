"use client";

import { ExternalArrowIcon } from "./icons/ArrowIcons";
import { useSpotifyConnectPopup } from "@/lib/useSpotifyConnectPopup";

/**
 * Drop page's Connect Spotify entry point (2026-11-04 — founder's own
 * ask: "i find myself using [the player] almost everytime i test it, i
 * want it easier for users to connect their spotify"). Only ever
 * rendered by DropDetail when the viewer is logged in and not already
 * connected — see that component's own comment for the split-with-
 * Share layout this sits in.
 */
export default function ConnectSpotifyButton() {
  const { connect, connecting } = useSpotifyConnectPopup();

  return (
    <button type="button" className="drop-action-btn" onClick={connect} disabled={connecting}>
      {connecting ? (
        "Connecting…"
      ) : (
        <>
          Connect <ExternalArrowIcon />
        </>
      )}
    </button>
  );
}
