import { redirect } from "next/navigation";

// /submit -> /browse (2026-10-07 — see claude/next-build.md): Browse
// replaces this page outright — its own Spotify search bar is now how
// you find and submit a pick, so any old /submit link or bookmark just
// forwards here rather than 404ing. Same pattern as the root "/" ->
// "/releases" redirect in src/app/page.tsx.
export default function SubmitPage() {
  redirect("/browse");
}
