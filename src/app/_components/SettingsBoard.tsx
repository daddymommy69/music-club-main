"use client";

import { useState } from "react";
import { CYCLE_OPTIONS, type CycleValue } from "@/lib/cycle";

type CuratorRow = { id: number; name: string | null; email: string | null };

type SettingsBoardProps = {
  clubName: string;
  cycle: CycleValue;
  cycleCustomDays: number | null;
  spotifyConnected: boolean;
  spotifyCallbackStatus: string | null;
  isAdmin: boolean;
  curators: CuratorRow[];
};

export default function SettingsBoard({
  clubName,
  cycle,
  cycleCustomDays,
  spotifyConnected,
  spotifyCallbackStatus,
  isAdmin,
  curators,
}: SettingsBoardProps) {
  return (
    <div className="gz-up">
      <ClubNameSection initialName={clubName} />
      <CycleSection initialCycle={cycle} initialCustomDays={cycleCustomDays} />
      <SpotifySection initialConnected={spotifyConnected} callbackStatus={spotifyCallbackStatus} />
      {isAdmin && <AdminSection initialCurators={curators} />}
    </div>
  );
}

async function saveClub(body: Record<string, unknown>) {
  const res = await fetch("/api/settings/club", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
  return data;
}

function ClubNameSection({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = name.trim() !== saved;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveClub({ name });
      setSaved(name.trim());
      setName(name.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-section">
      <label className="label" style={{ display: "block", marginBottom: 8 }}>
        Club name
      </label>
      <input
        className="settings-input"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        maxLength={80}
      />
      {error && (
        <p className="notice error" style={{ marginTop: 8 }}>
          {error}
        </p>
      )}
      {dirty && (
        <button
          type="button"
          className="btn"
          style={{ marginTop: 10, width: "auto", minHeight: 36, height: 36, padding: "0 14px", fontSize: 12 }}
          onClick={save}
          disabled={saving || !name.trim()}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      )}
    </div>
  );
}

function CycleSection({
  initialCycle,
  initialCustomDays,
}: {
  initialCycle: CycleValue;
  initialCustomDays: number | null;
}) {
  const [cycle, setCycle] = useState<CycleValue>(initialCycle);
  const [savedCycle, setSavedCycle] = useState<CycleValue>(initialCycle);
  const [customDays, setCustomDays] = useState(initialCustomDays ? String(initialCustomDays) : "");
  const [savedCustomDays, setSavedCustomDays] = useState(initialCustomDays);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickCycle(value: CycleValue) {
    setCycle(value);
    setError(null);
    // Custom needs a day count before there's anything meaningful to
    // save — reveal the field and wait for its own Save instead of
    // firing a request with no days attached.
    if (value === "custom") return;
    setSaving(true);
    try {
      await saveClub({ cycle: value });
      setSavedCycle(value);
    } catch (err) {
      setError((err as Error).message);
      setCycle(savedCycle);
    } finally {
      setSaving(false);
    }
  }

  async function saveCustomDays() {
    const days = parseInt(customDays, 10);
    if (!Number.isInteger(days) || days < 1) {
      setError("Enter how many days between drops");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveClub({ cycle: "custom", cycleCustomDays: days });
      setSavedCycle("custom");
      setSavedCustomDays(days);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const customDirty =
    cycle === "custom" && (savedCycle !== "custom" || parseInt(customDays, 10) !== savedCustomDays);

  return (
    <div className="settings-section">
      <label className="label" style={{ display: "block", marginBottom: 4 }}>
        Drop cycle
      </label>
      <p className="mut" style={{ fontSize: 11, marginTop: 0 }}>
        Manual means no scheduled date — every countdown in the app disappears.
      </p>
      <div className="cycle-grid">
        {CYCLE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`cycle-pill ${cycle === opt.value ? "active" : ""}`}
            onClick={() => pickCycle(opt.value)}
            disabled={saving}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {cycle === "custom" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <input
            className="settings-input"
            style={{ width: 100 }}
            type="number"
            min={1}
            max={3650}
            placeholder="Days"
            value={customDays}
            onChange={(e) => {
              setCustomDays(e.target.value);
              setError(null);
            }}
          />
          <span className="mut" style={{ fontSize: 11.5 }}>days between drops</span>
          {customDirty && (
            <button
              type="button"
              className="btn"
              style={{ width: "auto", minHeight: 36, height: 36, padding: "0 14px", fontSize: 12 }}
              onClick={saveCustomDays}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="notice error" style={{ marginTop: 10 }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** The Spotify auto-build connection (2026-10) — just one account for
 * the whole club, whoever clicks "Connect Spotify" here. Connecting is a
 * plain link to /api/spotify/connect rather than a fetch call, since
 * that route's whole job is to issue a redirect into Spotify's own
 * consent screen — not something you can do from inside a fetch(). */
function SpotifySection({
  initialConnected,
  callbackStatus,
}: {
  initialConnected: boolean;
  callbackStatus: string | null;
}) {
  const [connected, setConnected] = useState(initialConnected);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function disconnect() {
    setDisconnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/spotify/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Something went wrong. Try again.");
      setConnected(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="settings-section">
      <label className="label" style={{ display: "block", marginBottom: 8 }}>
        Spotify
      </label>
      {callbackStatus === "connected" && (
        <p className="notice" style={{ marginBottom: 10 }}>
          Spotify connected — new drops will auto-build a playlist when shipped.
        </p>
      )}
      {callbackStatus === "declined" && (
        <p className="notice" style={{ marginBottom: 10 }}>
          Spotify connection cancelled — nothing changed.
        </p>
      )}
      {callbackStatus === "error" && (
        <p className="notice error" style={{ marginBottom: 10 }}>
          Couldn&rsquo;t connect to Spotify. Try again, or check SPOTIFY_CLIENT_ID/SECRET are set.
        </p>
      )}

      {connected ? (
        <>
          <p className="mut" style={{ fontSize: 11.5, marginBottom: 10 }}>
            Connected — shipping a drop with the Spotify field left blank auto-builds that
            playlist.
          </p>
          <button
            type="button"
            className="btn"
            style={{ width: "auto", minHeight: 36, height: 36, padding: "0 14px", fontSize: 12 }}
            onClick={disconnect}
            disabled={disconnecting}
          >
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        </>
      ) : (
        <>
          <p className="mut" style={{ fontSize: 11.5, marginBottom: 10 }}>
            Not connected — ship currently needs a Spotify link pasted in by hand. Connect your
            account to auto-build it instead.
          </p>
          <a
            href="/api/spotify/connect"
            className="btn"
            style={{
              width: "auto",
              minHeight: 36,
              height: 36,
              padding: "0 14px",
              fontSize: 12,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Connect Spotify
          </a>
        </>
      )}
      {error && (
        <p className="notice error" style={{ marginTop: 10 }}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Admin-only (2026-10-06 — see claude/next-build.md): grant/revoke
 * curator status by email, without curling /api/admin/members/curator
 * by hand. That route still does the real enforcement (requires the
 * caller's own session to be isAdmin, and only ever promotes an
 * EXISTING member — it 404s on an email with no member row at all), so
 * someone has to sign up as a member first (at /signup or /account)
 * before they can be made a curator from here. The one exception —
 * FOUNDER_EMAIL bootstrapping itself in with no prior signup — lives
 * entirely in /api/curators/lookup, not here.
 */
function AdminSection({ initialCurators }: { initialCurators: CuratorRow[] }) {
  const [curators, setCurators] = useState(initialCurators);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    const target = email.trim();
    if (!target) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/members/curator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target, isCurator: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setCurators((prev) =>
        prev.some((c) => c.id === data.id) ? prev : [...prev, { id: data.id, name: null, email: target }]
      );
      setEmail("");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(curator: CuratorRow) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/members/curator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: curator.email, isCurator: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setCurators((prev) => prev.filter((c) => c.id !== curator.id));
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-section">
      <label className="label" style={{ display: "block", marginBottom: 8 }}>
        Curators
      </label>

      {curators.length === 0 ? (
        <p className="mut" style={{ fontSize: 11.5, marginBottom: 12 }}>
          No curators yet.
        </p>
      ) : (
        <div className="roster-list" style={{ marginBottom: 12 }}>
          {curators.map((c) => (
            <div className="roster-row" key={c.id}>
              <span className="roster-name">{c.name?.trim() || c.email || "Unnamed"}</span>
              <button
                type="button"
                className="link-btn"
                style={{ fontSize: 11.5 }}
                onClick={() => revoke(c)}
                disabled={busy}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={grant} style={{ display: "flex", gap: 8 }}>
        <input
          className="settings-input"
          type="email"
          placeholder="their@email.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
        />
        <button
          type="submit"
          className="btn"
          style={{ width: "auto", minHeight: 36, height: 36, padding: "0 14px", fontSize: 12 }}
          disabled={busy || !email.trim()}
        >
          {busy ? "Saving…" : "Grant"}
        </button>
      </form>
      <p className="mut" style={{ fontSize: 11, marginTop: 8 }}>
        They need to have signed up as a member first (at /signup or /account) — this only
        promotes an existing member to curator, it doesn&rsquo;t create one.
      </p>
      {error && (
        <p className="notice error" style={{ marginTop: 10 }}>
          {error}
        </p>
      )}
    </div>
  );
}

// JoinCodeSection removed (2026-10-06 QA sweep — see claude/next-build.md):
// curator login hasn't used a join code since it moved to email +
// emailed code, so this card was showing a code that does nothing if
// typed anywhere — actively misleading, not just unused. club.joinCode
// itself is untouched in the schema/DB; only this dead UI is gone.
