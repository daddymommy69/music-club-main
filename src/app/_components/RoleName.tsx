import InfoTip from "./InfoTip";

/**
 * A member's display name, colored by role (2026-10 "next build"
 * decision — see claude/next-build.md). Curator = gold/amber
 * (`--role-curator` in globals.css), everyone else = the site's
 * existing teal `--accent`. Shared wherever a member's name is a
 * public credit: /account, the leaderboard, curator-note authors, and
 * (going forward) Listener Pick attribution on the release page.
 *
 * The gold color has never had an explanation anywhere on the site —
 * the only place "curator" exists as a word is inside the logged-in
 * curator's own tools. 2026-10-13 ("site clarity" round, see
 * claude/next-build.md): a plain name — no InfoTip — kept the color a
 * mystery to anyone who isn't already a curator, including a future
 * one-off guest curator reading their own credit for the first time.
 * One InfoTip here covers every surface this component renders on.
 */
export default function RoleName({ name, isCurator }: { name: string; isCurator: boolean }) {
  return (
    <span className={isCurator ? "role-name role-curator" : "role-name role-member"}>
      {name}
      {isCurator && <InfoTip text="gold = a curator — picked the songs for this drop." />}
    </span>
  );
}
