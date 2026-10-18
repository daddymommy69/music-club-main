import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionMember } from "@/lib/memberSession";
import { siteCopy } from "@/lib/copy";
import CopyEditorForm from "@/app/_components/CopyEditorForm";

export const dynamic = "force-dynamic";

/**
 * Admin-only site copy editor (2026-10-18 — founder's own ask: a place
 * to tweak the site's wording himself — tagline, footer, the blurb
 * placeholders he already flagged not liking, and the new home-page
 * intro — without asking for a code change each time). Explicitly
 * "just me," not every curator (unlike the rest of the curator tools
 * area, which any curator can reach) — same isAdmin gate /settings
 * already uses for its curator-grant panel, just applied to this
 * whole page instead of one section of it.
 *
 * This doesn't write to a database or deploy anything on its own — per
 * his own description of what he wanted ("in claude tool that i can
 * change and download to update on github"), CopyEditorForm generates
 * an updated src/lib/copy.ts to download and upload through the same
 * manual GitHub flow every other change here goes through. See that
 * file's own comment for why every value in siteCopy has to stay a
 * plain literal string for this to work safely.
 */
export default async function CopyEditorPage() {
  const member = await getSessionMember();
  if (!member || !member.isCurator) redirect("/curators");
  if (!member.isAdmin) redirect("/account");

  return (
    <main className="shell page">
      <div style={{ marginBottom: 18 }}>
        <Link href="/account" className="mut" style={{ fontSize: 11 }}>
          ← Back to curator tools
        </Link>
      </div>

      <p className="label" style={{ marginBottom: 4 }}>
        Site copy
      </p>
      <p className="mut" style={{ fontSize: 11.5, marginBottom: 24, lineHeight: 1.6 }}>
        Edit any of this, then download the updated file and drop it into your next GitHub upload at{" "}
        <code>src/lib/copy.ts</code>. Nothing here saves on its own — closing this page without
        downloading just leaves the site as it is.
      </p>

      <CopyEditorForm initial={siteCopy} />
    </main>
  );
}
