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
 * This doesn't write anything the live site reads, or deploy anything
 * on its own — per his own description of what he wanted ("in claude
 * tool that i can change and download to update on github"),
 * CopyEditorForm generates an updated src/lib/copy.ts to download and
 * upload through the same manual GitHub flow every other change here
 * goes through. See that file's own comment for why every value in
 * siteCopy has to stay a plain literal string for this to work safely.
 *
 * 2026-10-19 — added a Save button alongside Download (founder's own
 * ask: "i want to be able to change the copy and it save here, so that
 * i can play around with the copy" before committing to a download).
 * Save writes to copyDrafts (src/db/schema.ts) via
 * /api/admin/copy-draft — a scratch table only this page and that route
 * ever touch. It's real persistence (survives a closed tab, follows
 * Jacob across devices) but it's still not the live site: nothing here
 * reads copyDrafts except this editor itself, so there's no live-write
 * path at all, same guarantee as before this button existed.
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
        Edit any of this and hit Save to keep your draft here while you play with the wording — it
        follows you across devices, but it never touches the live site. When you&rsquo;re happy with it,
        hit Download and drop the file into your next GitHub upload at <code>src/lib/copy.ts</code> — that
        last step is still the only thing that actually changes what visitors see.
      </p>

      <CopyEditorForm initial={siteCopy} />
    </main>
  );
}
