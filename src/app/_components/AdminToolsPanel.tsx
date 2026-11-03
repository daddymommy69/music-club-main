"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberRosterRow } from "@/lib/curatorAssignments";

type PendingCuratorRow = { id: number; email: string; invitedBy: string | null };

type Mode = "count" | "date" | "drops" | "unlimited";

type SearchResult = { id: number; name: string | null; email: string | null; isCurator: boolean };

/**
 * Admin Tools' curator-grant panel + full member roster (2026-11-03
 * "scoped curator terms" round — see claude/next-build.md). Replaces
 * SettingsBoard.tsx's old AdminSection: that one only ever flipped
 * isCurator on/off forever; this one grants for a set number of drops,
 * until a date, for hand-picked drop numbers, or still with no end
 * date, and shows every member's current status at a glance.
 *
 * Deliberately renders the roster/pending props straight through with
 * no mirrored local copy — every mutation below calls router.refresh()
 * instead of patching state by hand, so the list it shows always
 * matches what AdminToolsPage's own server-side listMemberRoster()
 * call just computed (remaining-count math, date-vs-open-drop
 * exceptions, etc. all live there, not duplicated here).
 */
export default function AdminToolsPanel({
  initialRoster,
  initialPending,
}: {
  initialRoster: MemberRosterRow[];
  initialPending: PendingCuratorRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Grant form state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [mode, setMode] = useState<Mode>("count");
  const [count, setCount] = useState("3");
  const [endDate, setEndDate] = useState("");
  const [dropNumsText, setDropNumsText] = useState("");

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced directly from the input's own change handler rather than
  // an effect keyed on `query` (same house pattern as BrowseSearch.tsx)
  // — this is a response to the person typing, not a sync-with-
  // external-system effect, and it keeps every setState call inside a
  // real event handler/async callback instead of an effect body.
  async function runSearch(q: string) {
    try {
      const res = await fetch(`/api/admin/members/search?q=${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => ({ results: [] }));
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    }
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);

    const q = value.trim();
    if (!q) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(() => runSearch(q), 300);
  }

  // Unmount-only cleanup so a pending debounce never fires (and calls
  // setState) after this component is gone.
  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  function pick(r: SearchResult) {
    setSelected(r);
    setQuery(r.name?.trim() || r.email || "");
    setResults([]);
  }

  function clearSelection() {
    setSelected(null);
    setQuery("");
  }

  async function grant() {
    setError(null);

    // A raw, unselected email only ever makes sense for "no end
    // date" — see /api/admin/members/curator's own comment: the other
    // modes need a real member row to attach a count/date/drop-list
    // to, so there's nothing sensible to pre-grant sight-unseen.
    if (!selected && mode !== "unlimited") {
      setError("Pick an existing member from the list above for this kind of grant.");
      return;
    }
    const email = !selected ? query.trim() : undefined;
    if (!selected && !email) {
      setError("Search for a member, or type an email to invite.");
      return;
    }

    const body: Record<string, unknown> = selected ? { memberId: selected.id, mode } : { email, mode };
    if (mode === "count") {
      const n = parseInt(count, 10);
      if (!Number.isInteger(n) || n < 1) {
        setError("Enter a whole number of at least 1.");
        return;
      }
      body.count = n;
    } else if (mode === "date") {
      if (!endDate) {
        setError("Pick an end date.");
        return;
      }
      body.endDate = new Date(`${endDate}T23:59:59`).toISOString();
    } else if (mode === "drops") {
      const nums = dropNumsText
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0);
      if (nums.length === 0) {
        setError("List at least one drop number, e.g. 9, 11, 13.");
        return;
      }
      body.dropNums = nums;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admin/members/curator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      clearSelection();
      setCount("3");
      setEndDate("");
      setDropNumsText("");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function endEarly(assignmentId: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/curator-assignments/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: assignmentId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelPending(row: PendingCuratorRow) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pending-curators", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gz-up">
      <div className="settings-section">
        <label className="label" style={{ display: "block", marginBottom: 8 }}>
          Grant curator status
        </label>

        {selected ? (
          <div className="member-picker-chip">
            <span>{selected.name?.trim() || selected.email || "Unnamed"}</span>
            <button type="button" className="link-btn" style={{ fontSize: 11 }} onClick={clearSelection}>
              Change
            </button>
          </div>
        ) : (
          <div className="member-picker" style={{ marginBottom: 10 }}>
            <input
              className="settings-input"
              placeholder="Search by name or email, or type an email to invite"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
            />
            {results.length > 0 && (
              <div className="member-picker-results">
                {results.map((r) => (
                  <button key={r.id} type="button" className="member-picker-row" onClick={() => pick(r)}>
                    {r.name?.trim() || "Unnamed"}
                    {r.email ? ` — ${r.email}` : ""}
                    {r.isCurator ? " (already a curator)" : ""}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mode-tabs">
          {([
            ["count", "Next N drops"],
            ["date", "Until a date"],
            ["drops", "Specific drops"],
            ["unlimited", "No end date"],
          ] as [Mode, string][]).map(([m, label]) => (
            <button
              key={m}
              type="button"
              className={`mode-tab${mode === m ? " active" : ""}`}
              onClick={() => setMode(m)}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "count" && (
          <input
            className="settings-input"
            type="number"
            min={1}
            style={{ maxWidth: 140, marginBottom: 10 }}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            placeholder="How many drops"
          />
        )}
        {mode === "date" && (
          <input
            className="settings-input"
            type="date"
            style={{ maxWidth: 200, marginBottom: 10 }}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        )}
        {mode === "drops" && (
          <input
            className="settings-input"
            placeholder="e.g. 9, 11, 13 — can include drops that don't exist yet"
            style={{ marginBottom: 10 }}
            value={dropNumsText}
            onChange={(e) => setDropNumsText(e.target.value)}
          />
        )}
        {mode === "unlimited" && (
          <p className="mut" style={{ fontSize: 11, marginBottom: 10 }}>
            Curator until you end it by hand — the old &ldquo;always on&rdquo; grant.
          </p>
        )}

        <button
          type="button"
          className="btn"
          style={{ width: "auto", minHeight: 36, height: 36, padding: "0 14px", fontSize: 12 }}
          onClick={grant}
          disabled={busy}
        >
          {busy ? "Saving…" : "Grant"}
        </button>

        {error && (
          <p className="notice error" style={{ marginTop: 10 }}>
            {error}
          </p>
        )}
      </div>

      {initialPending.length > 0 && (
        <div className="settings-section">
          <label className="label" style={{ display: "block", marginBottom: 8 }}>
            Pending invites
          </label>
          <div className="roster-list">
            {initialPending.map((p) => (
              <div className="roster-row" key={p.id}>
                <span className="roster-name">
                  {p.email}
                  <span className="roster-meta" style={{ marginLeft: 6 }}>
                    becomes curator (no end date) on signup
                  </span>
                </span>
                <button
                  type="button"
                  className="link-btn"
                  style={{ fontSize: 11.5 }}
                  onClick={() => cancelPending(p)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="settings-section">
        <label className="label" style={{ display: "block", marginBottom: 8 }}>
          Everyone
        </label>
        <div className="roster-list">
          {initialRoster.map((m) => (
            <div className="roster-row" key={m.id} style={{ alignItems: "flex-start" }}>
              <span className="roster-name" style={{ display: "flex", alignItems: "center" }}>
                <span
                  className={`status-dot ${
                    m.isCurator ? "status-dot-curator" : m.everCurator ? "status-dot-former-curator" : "status-dot-listener"
                  }`}
                />
                {m.name?.trim() || m.email || "Unnamed"}
              </span>
              <span style={{ textAlign: "right" }}>
                {m.activeAssignments.length === 0 ? (
                  <span className="roster-meta">{m.isCurator ? "curator" : "listener"}</span>
                ) : (
                  <span style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                    {m.activeAssignments.map((a) => (
                      <span key={a.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="roster-meta">{describeAssignment(a)}</span>
                        <button
                          type="button"
                          className="link-btn"
                          style={{ fontSize: 10.5 }}
                          onClick={() => endEarly(a.id)}
                          disabled={busy}
                        >
                          End now
                        </button>
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function describeAssignment(a: MemberRosterRow["activeAssignments"][number]): string {
  if (a.mode === "count") return `${a.remainingCount} drop${a.remainingCount === 1 ? "" : "s"} left`;
  if (a.mode === "date") return `until ${a.endDate ? new Date(a.endDate).toLocaleDateString() : "?"}`;
  if (a.mode === "drops") return a.dropNums.length > 0 ? `drops ${a.dropNums.join(", ")} left` : "drops complete";
  return "no end date";
}
