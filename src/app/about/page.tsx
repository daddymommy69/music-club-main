import SiteHeader from "@/app/_components/SiteHeader";
import { getDefaultClub } from "@/lib/club";
import { getPublicStats } from "@/lib/archive";
import { siteCopy, renderAboutHtml } from "@/lib/copy";

// The drop/song/artist counts change every time a drop ships — never
// freeze this at build time, same reasoning as /releases (see that
// page's own comment on this export).
export const dynamic = "force-dynamic";

/**
 * 2026-10-13 — founder's own copy, refined over several rounds (see
 * claude/next-build.md). Deliberately light: just enough for a
 * first-time visitor to understand what the site is — nothing about
 * how picks, curators, or shipping actually work under the hood.
 * That's left for people to find on their own rather than spelled out
 * here (the founder's explicit call — see that doc's "site clarity"
 * section for the full back-and-forth that landed on this wording and
 * layout).
 *
 * 2026-10-19 — the whole page's text moved into siteCopy.aboutText
 * (src/lib/copy.ts), editable from /admin/copy, so Jacob can tweak the
 * wording himself without a code change. The live counts and the
 * archives/subscribe links stay dynamic via {tokens} and [label](url)
 * links that renderAboutHtml fills in — see that function's own
 * comment for why this is the one place in the app that goes through
 * dangerouslySetInnerHTML (only ever admin-authored text, same trust
 * level as editing a source file directly).
 */
export default async function AboutPage() {
  const club = await getDefaultClub();
  const stats = await getPublicStats(club.id);

  const html = renderAboutHtml(siteCopy.aboutText, {
    dropCount: `<span class="about-num">${stats.dropCount}</span>`,
    songCount: `<span class="about-num">${stats.songCount}</span>`,
    artistCount: `<span class="about-num">${stats.artistCount}</span>`,
  });

  return (
    <>
      <SiteHeader />
      <main className="col page gz-up about-body">
        <h1 style={{ fontSize: 20, letterSpacing: "-0.02em", marginBottom: 12 }}>about</h1>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </main>
    </>
  );
}
