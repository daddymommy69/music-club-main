"use client";

import { useState } from "react";

/**
 * Real share control for a drop page (2026-10-08 — founder's own
 * report: "it doesn't show a share button, but it should" — this
 * replaces the old plain-text `share-url` line, see
 * claude/next-build.md). `url` must already be a real, absolute,
 * clickable URL (src/lib/site.ts's siteUrl(), never siteDisplayPath()
 * — that one's display-only, by its own comment).
 *
 * Native share sheet first (mobile Safari/Chrome, most of this app's
 * actual audience); falls back to a clipboard copy with a brief
 * "Copied" confirmation on desktop, where navigator.share usually
 * doesn't exist at all. If the native sheet itself is what's open and
 * the visitor cancels/dismisses it, that's left alone — no clipboard
 * write happens behind a sheet they just closed.
 */
export default function ShareButton({ url, title }: { url: string; title?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ url, title });
      } catch {
        // Cancelled by the visitor, or blocked by the platform — either
        // way, not a reason to fall back to a clipboard copy.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure context, denied permission, etc.) —
      // nothing more to do silently.
    }
  }

  return (
    <button type="button" className={`share-btn${copied ? " is-copied" : ""}`} onClick={handleShare}>
      {copied ? "Copied ✓" : "Share ↗"}
    </button>
  );
}
