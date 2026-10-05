import SiteHeader from "@/app/_components/SiteHeader";
import PublicSubmitForm from "@/app/_components/PublicSubmitForm";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";

export const dynamic = "force-dynamic";

/**
 * /submit (revised 2026-10-06 — see claude/next-build.md's "submit,
 * revisited" note). Short version: the fully-gated "sign up or log in
 * first" version shipped earlier this build was a step too far — the
 * founder wants the old one-field-feeling simplicity back, with just a
 * valid-looking email required as a spam/typo deterrent. No separate
 * sign-up screen shown here; see PublicSubmitForm.tsx and
 * /api/submit's own comments for exactly what the email does (and
 * does not) prove, and how it differs from /account's fuller,
 * code-verified login.
 */
export default async function SubmitPage() {
  const club = await getDefaultClub();
  const openDrop = await getOpenDrop(club);

  return (
    <>
      <SiteHeader />
      <main className="col page gz-up">
        <h1 style={{ fontSize: 19, letterSpacing: "-0.02em", marginBottom: 20 }}>
          Submit a song
        </h1>

        {openDrop ? (
          <PublicSubmitForm dropNum={openDrop.num} />
        ) : (
          <div className="status-strip" style={{ marginBottom: 0 }}>
            <span>submissions closed</span>
            <span className="mut">no drop is open for picks right now</span>
          </div>
        )}
      </main>
    </>
  );
}
