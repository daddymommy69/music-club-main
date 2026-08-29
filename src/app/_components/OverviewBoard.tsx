"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatRelativeTime } from "@/lib/relativeTime";

type PileItem = {
  id: number;
  title: string | null;
  artist: string | null;
  link: string;
  submittedBy: string | null;
  submittedAt: string;
  pulledAt: string | null;
};

type RosterCurator = {
  id: number;
  name: string;
  picksThisCycle: number;
  picksLifetime: number;
  joinedAt: string;
};

type OverviewBoardProps = {
  dropNum: number;
  isManual: boolean;
  daysUntilNext: number | null;
  hasOpenDrop: boolean;
  subscriberCount: number;
  pile: PileItem[];
  roster: RosterCurator[];
};

function timeLabel(isManual: boolean, daysUntilNext: number | null) {
  if (isManual) return "no scheduled date";
  if (daysUntilNext === null) return "timing unknown";
  if (daysUntilNext === 0) return "shipping today";
  // No trailing "left" — the stat's own label already reads "Remaining",
  // so "45 days left" under it said the same thing twice.
  return `${daysUntilNext} day${daysUntilNext === 1 ? "" : "s"}`;
}

function joinedLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function OverviewBoard({
  dropNum,
  isManual,
  daysUntilNext,
  hasOpenDrop,
  subscriberCount,
  pile,
  roster,
}: OverviewBoardProps) {
  const router = useRouter();

  return (
    <>
      <div className="stat-row gz-up">
        <Stat label="Drop" value={String(dropNum)} />
        <Stat label="Remaining" value={timeLabel(isManual, daysUntilNext)} />
        <Stat label="Subscribers" value={String(subscriberCount)} />
        <Stat label="Submissions" value={String(pile.length)} />
      </div>

      <p className="label" style={{ marginBottom: 14 }}>
        Submission pile
      </p>
      {pile.length === 0 ? (
        <div className="empty-state" style={{ padding: "24px 0" }}>
          Nothing submitted for this drop yet.
        </div>
      ) : (
        <div className="pile-list">
          {pile.map((item) => (
            <PileRow key={item.id} item={item} hasOpenDrop={hasOpenDrop} onAdded={() => router.refresh()} />
          ))}
        </div>
      )}

      <p className="label" style={{ margin: "32px 0 14px" }}>
        Curators
      </p>
      <div className="roster-list">
        {roster.map((c) => (
          <div key={c.id} className="roster-row">
            <span className="roster-name">{c.name}</span>
            <span className="roster-meta">
              {c.picksThisCycle} this cycle · {c.picksLifetime} lifetime · joined {joinedLabel(c.joinedAt)}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function PileRow({
  item,
  hasOpenDrop,
  onAdded,
}: {
  item: PileItem;
  hasOpenDrop: boolean;
  onAdded: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alreadyAdded = !!item.pulledAt;

  async function quickAdd() {
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/overview/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: item.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      onAdded();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="pile-row">
      <div className="pile-info">
        <div className="track-title">
          {item.title && item.artist ? item.title : item.link}
        </div>
        {item.title && item.artist && <div className="track-artist">{item.artist}</div>}
        <div className="pile-meta">
          {item.submittedBy ?? "—"} · {formatRelativeTime(new Date(item.submittedAt))}
        </div>
      </div>
      <div className="pile-action">
        {alreadyAdded ? (
          <span className="pile-added">Added ✓</span>
        ) : (
          <button
            type="button"
            className="btn"
            style={{ width: "auto", minHeight: 32, height: 32, padding: "0 12px", fontSize: 11.5 }}
            onClick={quickAdd}
            disabled={adding || !hasOpenDrop}
            title={!hasOpenDrop ? "No drop in progress right now" : undefined}
          >
            {adding ? "Adding…" : "Quick-add"}
          </button>
        )}
        {error && (
          <p className="notice error" style={{ marginTop: 6, maxWidth: 160 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
