import { redirect } from "next/navigation";

// /signup folds into /account (2026-10 release-page redesign — see
// claude/next-build.md): the founder's explicit call after seeing the
// consolidated mockup ("ok no sign up but lets fine tune the account
// page") — one entry point instead of three, no separate pitch/
// explainer page. AccountAuth (rendered on /account) is the same
// combined signup-or-login card this page used to show via SignupForm,
// just without the pitch copy around it. This route is kept (rather
// than deleted outright) so any bookmarked/shared /signup link still
// lands somewhere real instead of 404ing.
export default function SignupPage() {
  redirect("/account");
}
