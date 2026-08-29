import { notFound } from "next/navigation";
import { getDefaultClub } from "@/lib/club";
import { getSubscriberByYouToken } from "@/lib/subscribers";
import { getLatestPublicDrop } from "@/lib/archive";
import { getTargetDropForTop10, getTop10Summary, getSubscriberTop10Pick } from "@/lib/top10Data";
import YouPage from "@/app/_components/YouPage";

export const dynamic = "force-dynamic";

// #/you (design-handoff.md §5): what the link in a subscriber's text or
// email opens. Personalized, no login — identity comes entirely from the
// unguessable token in the URL. Always resolves to whatever drop is
// currently newest, not whichever drop was current when their link was
// first sent ("the link in your text always opens the newest drop").
export default async function YouTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const subscriber = await getSubscriberByYouToken(token);
  if (!subscriber) notFound();

  const club = await getDefaultClub();
  if (subscriber.clubId !== club.id) notFound();

  const drop = await getLatestPublicDrop(club.id);

  // Top 10 only ever shows here while its window is actually open — see
  // src/lib/top10.ts. Before that it's just not relevant yet; after it
  // closes, the result lives publicly on /drop/:num instead (this page
  // has no "closed" state of its own to keep it simple).
  const top10Drop = await getTargetDropForTop10(club.id);
  const top10Summary = top10Drop ? await getTop10Summary(top10Drop) : null;
  const myTop10Pick =
    top10Summary?.phase === "open" && top10Drop
      ? await getSubscriberTop10Pick(top10Drop.id, subscriber.id)
      : null;

  return (
    <main className="shell page you-page">
      <YouPage
        token={token}
        clubName={club.name}
        name={subscriber.name}
        wantsText={subscriber.wantsText}
        wantsEmail={subscriber.wantsEmail}
        optedOut={subscriber.optedOut}
        drop={
          drop
            ? {
                num: drop.num,
                title: drop.title,
                publishedAt: drop.publishedAt.toISOString(),
                spotifyUrl: drop.spotifyUrl,
                appleUrl: drop.appleUrl,
                songs: drop.songs,
                notes: drop.notes,
              }
            : null
        }
        top10={
          top10Summary?.phase === "open"
            ? {
                myPick: myTop10Pick
                  ? { title: myTop10Pick.title, artist: myTop10Pick.artist, link: myTop10Pick.link }
                  : null,
              }
            : null
        }
      />
    </main>
  );
}
