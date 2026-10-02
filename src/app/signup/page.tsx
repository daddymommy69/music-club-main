import SiteHeader from "../_components/SiteHeader";
import DropTextPreview from "../_components/DropTextPreview";
import SignupHero from "../_components/SignupHero";
import SignupForm from "../_components/SignupForm";
import { getDefaultClub } from "@/lib/club";
import { getSignupContext } from "@/lib/signup";

export const dynamic = "force-dynamic";

// The dedicated sign-up page (moved here from "/" — the site now opens
// on Releases, see /releases and the popup rendered there). Kept as its
// own standalone page rather than only living in the popup, since the
// popup only shows once per visitor.
export default async function SignupPage() {
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
          A shared playlist, sent to your inbox. Sign up once, that&rsquo;s it.
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
