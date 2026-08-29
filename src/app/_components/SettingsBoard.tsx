"use client";

import { useState } from "react";
import { CYCLE_OPTIONS, type CycleValue } from "@/lib/cycle";

type SettingsBoardProps = {
  clubName: string;
  cycle: CycleValue;
  cycleCustomDays: number | null;
  joinCode: string;
};

export default function SettingsBoard({
  clubName,
  cycle,
  cycleCustomDays,
  joinCode,
}: SettingsBoardProps) {
  return (
    <div className="gz-up">
      <ClubNameSection initialName={clubName} />
      <CycleSection initialCycle={cycle} initialCustomDays={cycleCustomDays} />
      <JoinCodeSection joinCode={joinCode} />
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

function JoinCodeSection({ joinCode }: { joinCode: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can fail (permissions, insecure context) — the
      // code is still right there on screen to copy by hand.
    }
  }

  return (
    <div className="settings-section">
      <label className="label" style={{ display: "block", marginBottom: 8 }}>
        Join code
      </label>
      <div className="join-code-row">
        <span className="join-code-value">{joinCode}</span>
        <button
          type="button"
          className="btn"
          style={{ width: "auto", minHeight: 36, height: 36, padding: "0 14px", fontSize: 12 }}
          onClick={copy}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="mut" style={{ fontSize: 11, marginTop: 8 }}>
        New curators enter this to join.
      </p>
    </div>
  );
}
