import Link from "next/link";
import type { SubmitContext } from "@/lib/submit";

export default function SubmitClosed({
  nextDropNum,
  daysUntilNext,
  isManual,
}: Pick<SubmitContext, "nextDropNum" | "daysUntilNext" | "isManual">) {
  return (
    <div className="gz-up">
      {isManual ? (
        <p style={{ fontSize: 15, lineHeight: 1.5, margin: "12px 0 26px" }}>
          Submissions open when the next drop goes out.
        </p>
      ) : (
        <div style={{ margin: "12px 0 26px" }}>
          {/* Muted, not accent — the handoff calls this a "large --mut
              numeral" specifically to keep the closed state visually
              distinct from the celebratory accent numeral used
              everywhere else (sign-up hero, drop detail, /you). */}
          <div className="numeral" style={{ fontSize: 60, color: "var(--mut)" }}>
            {daysUntilNext ?? "—"}
          </div>
          <div className="mut" style={{ fontSize: 11 }}>
            days until submissions open
          </div>
        </div>
      )}

      <div className="status-strip">
        <span>submissions closed</span>
        <span className="mut">curators are building drop {nextDropNum}</span>
      </div>

      <div className="acc-panel">
        <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
          Get a text when the floor opens.
        </p>
        <Link href="/" className="btn btn-primary" style={{ display: "flex" }}>
          Sign me up
        </Link>
      </div>
    </div>
  );
}
