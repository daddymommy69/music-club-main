import Link from "next/link";
import SiteHeader from "@/app/_components/SiteHeader";
import ListenerPickForm from "@/app/_components/ListenerPickForm";
import { getDefaultClub } from "@/lib/club";
import { getSessionMember } from "@/lib/memberSession";
import { getOpenDrop } from "@/lib/room";
import { getListenerPick } from "@/lib/listenerPicks";

export const dynamic = "force-dynamic";

/**
 * /submit (2026-10 "next build" — see claude/next-build.md). Replaces
 * the old anonymous-name text box: signing up is now the key to
 * submitting a song, not a separate name field on this page. The old
 * `submissions` table and its history are untouched — this page simply
 * stops writing new rows to it, writing a Listener Pick straight into
 * `songs` instead (see src/lib/listenerPicks.ts).
 *
 * Not logged in → point at /account to sign up or log in (no password,
 * same lightweight signup as before — see /api/members/lookup).
 * Logged in → ListenerPickForm for whatever drop is currently open; if
 * none is, a short explanatory state (the gap between one drop shipping
 * and the next one starting, not a submission-window countdown the way
 * the old flow had one — Listener Picks are tied to the open drop
 * itself now, not to days-since-last-ship).
 */
export default async function SubmitPage() {
  const club = await getDefaultClub();
  const member = await getSessionMember();
  const openDrop = member ? await getOpenDrop(club) : null;
  const pick = member && openDrop ? await getListenerPick(openDrop.id, member.id) : null;

  return (
    <>
      <SiteHeader />
      <main className="col page">
        <h1 style={{ fontSize: 19, letterSpacing: "-0.02em", marginBottom: 20 }}>
          Submit a song
        </h1>

        {!member ? (
          <div className="gz-up">
            <p style={{ fontSize: 13, lineHeight: 1.65, marginBottom: 20 }}>
              Submitting a song is for signed-up members now — there&rsquo;s no more
              anonymous drop box. Sign up (just your name and email, no password) or
              log back in to submit this cycle&rsquo;s pick.
            </p>
            <Link href="/account" className="btn btn-primary" style={{ display: "flex" }}>
              Sign up or log in
            </Link>
          </div>
        ) : openDrop ? (
          <ListenerPickForm
            openDrop={{ num: openDrop.num, title: openDrop.title }}
            initialPick={pick ? { title: pick.title, artist: pick.artist, sourceUrl: pick.sourceUrl } : null}
          />
        ) : (
          <div className="gz-up status-strip" style={{ marginBottom: 0 }}>
            <span>submissions closed</span>
            <span className="mut">no drop is open for picks right now</span>
          </div>
        )}
      </main>
    </>
  );
}
