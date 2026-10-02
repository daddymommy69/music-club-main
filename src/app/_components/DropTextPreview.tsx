import Link from "next/link";
import type { SignupContext } from "@/lib/signup";

/**
 * The block that leads the sign-up page. Answers the two silent
 * objections to giving out an email address — what arrives, and how
 * often — before the visitor ever reaches the form.
 */
export default function DropTextPreview({
  latestPublishedDrop,
  isManual,
  cycleDays,
}: Pick<SignupContext, "latestPublishedDrop" | "isManual" | "cycleDays">) {
  const cadence = isManual
    ? "One email a drop, whenever a drop is ready. Nothing else."
    : `One email a drop, about every ${cycleDays ?? 45} days. Nothing else.`;

  return (
    <div className="drop-preview gz-up">
      <div className="label" style={{ marginBottom: 10 }}>
        The email you&rsquo;ll get
      </div>

      <div className="sms-bubble">
        {latestPublishedDrop ? (
          <>
            <div>
              project music club {String(latestPublishedDrop.num).padStart(2, "0")}
              {latestPublishedDrop.title ? ` — "${latestPublishedDrop.title}"` : ""}
            </div>
            <div style={{ color: "var(--accent)", marginTop: 2 }}>
              {latestPublishedDrop.shareUrl}
            </div>
          </>
        ) : (
          <div>You&rsquo;ll get an email like this once the first drop ships.</div>
        )}
      </div>

      <Link href="/archive" style={{ fontSize: 12.5, display: "inline-block", marginTop: 10 }}>
        Hear every drop so far →
      </Link>
      <p className="mut" style={{ fontSize: 11, marginTop: 6 }}>
        {cadence}
      </p>
    </div>
  );
}
