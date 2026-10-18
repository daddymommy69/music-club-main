import type { Metadata } from "next";
import { generateReleasesMetadata, ReleasesPageContent } from "./releases/page";

// "/" renders the releases page directly now (2026-10-18 — founder's
// own ask: "im thinking about making the releases page the main drop
// page (which is already is) but remove the releases part in the
// link... releases link is just musicclub.fyi"). Used to just
// `redirect("/releases")`; now it renders the exact same content in
// place, via the shared ReleasesPageContent/generateReleasesMetadata
// exported from that route's own page.tsx, so there's one real
// implementation and two thin route wrappers, not two copies to keep
// in sync. "/releases" itself is untouched and still resolves (his own
// "its fine" to leaving the old URL alive for anyone with a bookmark
// or old link) — both routes now render identically, and
// generateMetadata always canonicalizes to "/" regardless of which one
// served the request.
//
// `dynamic` has to be a literal export in this file specifically (not
// re-exported) for Next's build-time route-config analysis to pick it
// up — same reason /releases/page.tsx declares its own copy rather
// than this file importing it.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return generateReleasesMetadata();
}

export default async function Home() {
  return ReleasesPageContent();
}
