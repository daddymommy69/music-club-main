import { siteCopy } from "@/lib/copy";

/**
 * Site-wide signature (2026-10-16 — founder's own ask: "i still want
 * the footer of my dads font that leads to my portfolio"). Rendered
 * once in the root layout (src/app/layout.tsx) rather than per-page, so
 * it floats in the same bottom-right spot on every page without having
 * to be added anywhere else — the founder's own call, "every page site
 * wide... just have it float down there bottom right corner." His
 * dad's font (IceCityArchitect — see globals.css's @font-face) is
 * scoped to just this line via the .site-footer class, not applied
 * site-wide.
 */
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <a href="https://portfolio.jacobfogelhut.workers.dev/" target="_blank" rel="noreferrer">
        {siteCopy.footerSignature}
      </a>
    </footer>
  );
}
