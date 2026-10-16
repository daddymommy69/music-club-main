"use client";

import { useState } from "react";

export type ShipDropCardProps = {
  dropNum: number;
  pickCount: number;
  onChanged: () => void;
};

type SpotifyAutoBuild = {
  matchedCount: number;
  totalCount: number;
  unmatchedTitles: string[];
} | null;

/**
 * The "finish the drop" step — once curators are done picking, ship it
 * or cancel it. Nested inside the Manage-this-drop panel (2026-10-08
 * "drop control" round — see claude/next-build.md: "replace and be
 * apart of... add to it"). No longer has its own title field — that's
 * ManageDropCard's own Rename control (CuratorToolsPanel.tsx).
 *
 * Ship and Cancel now share one component and sit side by side as a
 * matched pair (2026-10-16 revamp — founder's own ask: "make the ship
 * drop 2 and cancel drop 2 side by side buttons same length, and make
 * the cancel drop to match the ship drop 2 but in red"). Cancel used
 * to be its own standalone CancelDropControl, a plain text link off to
 * the side — merged in here so the two actually-equal-weight actions
 * (ship it, or close it off) read as a matched pair instead of one
 * being visually an afterthought. Clicking Cancel still swaps straight
 * to the "are you sure" confirmation in place of both buttons, same
 * two-step safety as before, just without the small-text-link
 * in-between state it used to start from.
 *
 * The Spotify playlist auto-builds from this drop's songs when that
 * field's left blank (search-match each song, create a public
 * playlist, upload a matching cover) — pasting a link here still works
 * and always wins, as the manual fallback for whenever auto-build isn't
 * connected or you want to override it. Apple Music stays a manual
 * paste, same as always. Same one-shot behavior either way: once this
 * succeeds the drop is published and the release message is already
 * sent, so there's nothing left to edit here afterward (the next load
 * simply won't have a ship candidate anymore).
 */
export default function ShipDropCard({ dropNum, pickCount, onChanged }: ShipDropCardProps) {
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [appleUrl, setAppleUrl] = useState("");
  const [shipping, setShipping] = useState(false);
  const [shipError, setShipError] = useState<string | null>(null);
  const [shipped, setShipped] = useState<{ sent: number; total: number } | null>(null);
  const [spotifyAutoBuild, setSpotifyAutoBuild] = useState<SpotifyAutoBuild>(null);
  // Collapsed by default (2026-10-08 curator tools redesign — see
  // claude/next-build.md): most ships leave both links blank and let
  // Spotify auto-build, so the two paste-a-link fields are clutter on
  // every view that doesn't need them. The disclosure opens itself if
  // there's already a link to show (e.g. after a validation error).
  const [linksOpen, setLinksOpen] = useState(false);

  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function ship(e: React.FormEvent) {
    e.preventDefault();
    setShipping(true);
    setShipError(null);
    try {
      const res = await fetch("/api/overview/ship", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spotifyUrl: spotifyUrl.trim() || undefined,
          appleUrl: appleUrl.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setShipError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setShipped({ sent: data.sent ?? 0, total: data.total ?? 0 });
      setSpotifyAutoBuild(data.spotifyAutoBuild ?? null);
    } catch {
      setShipError("Something went wrong. Try again.");
    } finally {
      setShipping(false);
    }
  }

  async function cancel() {
    setCanceling(true);
    setCancelError(null);
    try {
      const res = await fetch("/api/overview/cancel", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCancelError(data.error ?? "Couldn't cancel that. Try again.");
        return;
      }
      onChanged();
    } catch {
      setCancelError("Couldn't cancel that. Try again.");
    } finally {
      setCanceling(false);
    }
  }

  if (shipped) {
    return (
      <div className="acc-panel">
        <p style={{ fontSize: 13 }}>
          Drop {dropNum} is live — sent to {shipped.sent} of {shipped.total} subscribers.
        </p>
        {spotifyAutoBuild && (
          <p style={{ fontSize: 12, marginTop: 8 }}>
            Spotify playlist built — matched {spotifyAutoBuild.matchedCount} of{" "}
            {spotifyAutoBuild.totalCount} song{spotifyAutoBuild.totalCount === 1 ? "" : "s"}.
            {spotifyAutoBuild.unmatchedTitles.length > 0 && (
              <>
                {" "}
                Couldn&rsquo;t find: <span className="mut">{spotifyAutoBuild.unmatchedTitles.join(", ")}</span>.
              </>
            )}
          </p>
        )}
      </div>
    );
  }

  // Reversible — nothing's deleted, curator-only visibility, the drop
  // number stays used up either way (founder's own calls: "wouldnt
  // want it to lose all the data... closed off for curators eyes
  // only" / "can be uncancelled"). The un-cancel side lives in
  // CanceledDropBanner (CuratorToolsPanel.tsx), shown instead of this
  // once nothing's open.
  if (confirmingCancel) {
    return (
      <div className="duplicate-notice gz-up">
        <p style={{ fontSize: 12, lineHeight: 1.6 }}>
          Cancel drop {dropNum}? Nothing&rsquo;s deleted — its picks stay put and a curator can
          un-cancel it later. It just closes off from here on, and the drop number stays used up.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button
            type="button"
            className="btn"
            style={{ width: "auto", minHeight: 32, height: 32, padding: "0 12px", fontSize: 11.5 }}
            disabled={canceling}
            onClick={cancel}
          >
            {canceling ? "Canceling…" : "Yes, cancel it"}
          </button>
          <button type="button" className="link-btn" disabled={canceling} onClick={() => setConfirmingCancel(false)}>
            Never mind
          </button>
        </div>
        {cancelError && (
          <p className="notice error" style={{ marginTop: 8 }}>
            {cancelError}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={ship} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p className="mut" style={{ fontSize: 11.5, marginBottom: 2 }}>
        {pickCount} pick{pickCount === 1 ? "" : "s"} so far. Spotify builds itself automatically
        from the picks. Ship publishes this drop and texts/emails everyone, no separate step
        after this.
      </p>
      {linksOpen ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="text"
            className="settings-input"
            value={spotifyUrl}
            onChange={(e) => setSpotifyUrl(e.target.value)}
            placeholder="Spotify link (optional — leave blank to auto-build)"
          />
          <input
            type="text"
            className="settings-input"
            value={appleUrl}
            onChange={(e) => setAppleUrl(e.target.value)}
            placeholder="Apple Music link (optional)"
          />
        </div>
      ) : (
        <button
          type="button"
          className="link-btn"
          onClick={() => setLinksOpen(true)}
          style={{ alignSelf: "flex-start" }}
        >
          + add Spotify/Apple Music links manually
        </button>
      )}

      {shipError && <p className="notice error">{shipError}</p>}

      {/* Matched pair, equal width, side by side (2026-10-16 — see this
          file's own top comment). .ship-cancel-row (globals.css)
          overrides .btn-primary/.btn-danger's own width:100% to flex:1
          each instead, same override pattern as .listen-row-primary on
          the public drop page. */}
      <div className="ship-cancel-row">
        <button type="submit" className="btn btn-primary" disabled={shipping}>
          {shipping ? "Shipping…" : `Ship drop ${dropNum}`}
        </button>
        <button type="button" className="btn btn-danger" disabled={shipping} onClick={() => setConfirmingCancel(true)}>
          Cancel drop {dropNum}
        </button>
      </div>
    </form>
  );
}
