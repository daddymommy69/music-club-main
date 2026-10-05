/**
 * A member's display name, colored by role (2026-10 "next build"
 * decision — see claude/next-build.md). Curator = gold/amber
 * (`--role-curator` in globals.css), everyone else = the site's
 * existing teal `--accent`. Shared wherever a member's name is a
 * public credit: /account, the leaderboard, curator-note authors, and
 * (going forward) Listener Pick attribution on the release page.
 */
export default function RoleName({ name, isCurator }: { name: string; isCurator: boolean }) {
  return <span className={isCurator ? "role-name role-curator" : "role-name role-member"}>{name}</span>;
}
