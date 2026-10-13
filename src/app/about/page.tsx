import Link from "next/link";
import SiteHeader from "@/app/_components/SiteHeader";
import { getDefaultClub } from "@/lib/club";
import { getPublicStats } from "@/lib/archive";

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
 */
export default async function AboutPage() {
  const club = await getDefaultClub();
  const stats = await getPublicStats(club.id);

  return (
    <>
      <SiteHeader />
      <main className="col page gz-up about-body">
        <h1 style={{ fontSize: 20, letterSpacing: "-0.02em", marginBottom: 12 }}>about</h1>

        <p>welcome to the club.</p>

        <p>
          every so often, a playlist will drop and get sent to subscribers in their email. there
          are <span className="about-num">{stats.dropCount}</span> drops,{" "}
          <span className="about-num">{stats.songCount}</span> songs, from{" "}
          <span className="about-num">{stats.artistCount}</span> artists.
        </p>

        <p>
          take a look at the{" "}
          <Link href="/releases" className="about-link">
            old drops
          </Link>{" "}
          and the music we listen to. please enjoy and{" "}
          <Link href="/account" className="about-link">
            subscribe
          </Link>{" "}
          to get the playlists sent to your email directly.
        </p>
      </main>
    </>
  );
}
