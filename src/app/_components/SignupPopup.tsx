import Link from "next/link";

/**
 * The Releases-page "join" entry point (2026-10 release-page redesign —
 * see claude/next-build.md). Used to be its own modal with a full
 * sign-up form in it (see git history) — now that /signup folds into
 * /account as the site's single entry point, a second in-page form here
 * would just be a fourth place to sign up instead of three, the exact
 * opposite of what the founder asked for. A plain link to the one real
 * entry point.
 */
export default function SignupPopup() {
  return (
    <Link href="/account" className="btn btn-accent signup-popup-trigger">
      Join the club
    </Link>
  );
}
