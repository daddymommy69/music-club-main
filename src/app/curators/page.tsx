import Link from "next/link";
import CuratorLogin from "@/app/_components/CuratorLogin";

// The curator page stands apart from the public nav (design-handoff.md:
// "the curator page can stand apart since it's gated"), so this doesn't
// use SiteHeader.
export default function CuratorsPage() {
  return (
    <main className="col page">
      <Link href="/" className="wordmark" style={{ display: "block", marginBottom: 4 }}>
        project music club
      </Link>
      <p className="mut" style={{ fontSize: 11.5, marginBottom: 28 }}>
        Curator login
      </p>
      <CuratorLogin />
    </main>
  );
}
