import SiteHeader from "@/app/_components/SiteHeader";
import SubmitClosed from "@/app/_components/SubmitClosed";
import SubmitOpen from "@/app/_components/SubmitOpen";
import { getDefaultClub } from "@/lib/club";
import { getSubmitContext } from "@/lib/submit";

export const dynamic = "force-dynamic";

export default async function SubmitPage() {
  const club = await getDefaultClub();
  const ctx = await getSubmitContext(club);

  return (
    <>
      <SiteHeader />
      <main className="col page">
        <h1 style={{ fontSize: 19, letterSpacing: "-0.02em", marginBottom: 20 }}>
          Submit a song
        </h1>
        {ctx.isOpen ? (
          <SubmitOpen nextDropNum={ctx.nextDropNum} initialCount={ctx.submissionCount} />
        ) : (
          <SubmitClosed
            nextDropNum={ctx.nextDropNum}
            daysUntilNext={ctx.daysUntilNext}
            isManual={ctx.isManual}
          />
        )}
      </main>
    </>
  );
}
