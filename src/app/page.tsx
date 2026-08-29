import SiteHeader from "./_components/SiteHeader";
import DropTextPreview from "./_components/DropTextPreview";
import SignupHero from "./_components/SignupHero";
import SignupForm from "./_components/SignupForm";
import { getDefaultClub } from "@/lib/club";
import { getSignupContext } from "@/lib/signup";

export const dynamic = "force-dynamic";

export default async function Home() {
  const club = await getDefaultClub();
  const ctx = await getSignupContext(club);

  return (
    <>
      <SiteHeader />
      <main className="col page">
        <DropTextPreview
          latestPublishedDrop={ctx.latestPublishedDrop}
          isManual={ctx.isManual}
          cycleDays={ctx.cycleDays}
        />

        <SignupHero
          nextDropNum={ctx.nextDropNum}
          daysUntilNext={ctx.daysUntilNext}
          isManual={ctx.isManual}
          subscriberCount={ctx.subscriberCount}
        />

        <p className="mut" style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 26 }}>
          A shared playlist, sent to you by text or email. Sign up once, that&rsquo;s
          it.
        </p>

        <SignupForm
          nextDropNum={ctx.nextDropNum}
          daysUntilNext={ctx.daysUntilNext}
          isManual={ctx.isManual}
        />
      </main>
    </>
  );
}
