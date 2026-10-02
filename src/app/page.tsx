import { redirect } from "next/navigation";

// The site now opens on Releases (design decision, 2026-10): the old
// sign-up-first root moved to /signup, and this bare "/" just forwards
// to the archive. /archive itself still carries all the intercepting
// -route modal machinery for /drop/[num], untouched.
export default function Home() {
  redirect("/archive");
}
