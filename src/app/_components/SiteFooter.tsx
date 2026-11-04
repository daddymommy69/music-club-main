import { siteCopy } from "@/lib/copy";

/**
 * Site-wide signature (2026-10-16 — founder's own ask: "i still want
 * the footer of my dads font that leads to my portfolio"). Rendered
 * once in the root layout (src/app/layout.tsx) rather than per-page, so
 * it floats in the same bottom-right spot on every page without having
 * to be added anywhere else — the founder's own call, "every page site
 * wide... just have it float down there bottom right corner."
 *
 * 2026-11-04 round — founder's own hand-drawn "JPF" mark (a different
 * artifact he made) replaces the old IceCityArchitect-font text here,
 * same spot/same floating-corner behavior, explicitly confirmed to
 * stay as-is rather than move into normal page flow (see that round's
 * notes). Two color variants (public/jpf-signature-light.png,
 * -dark.png — same source mark, re-inked to each theme's --fg) picked
 * via <picture>/prefers-color-scheme, same split this site's CSS
 * tokens already use — there's no manual light/dark toggle here, only
 * the OS preference, so a plain media-query <source> is all this
 * needs, no JS. siteCopy.footerSignature (still admin-editable via
 * /admin/copy) becomes the image's accessible name instead of its
 * visible text, so the link's a11y label is unchanged even though the
 * mark itself isn't copy-editable.
 */
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <a href="https://portfolio.jacobfogelhut.workers.dev/" target="_blank" rel="noreferrer">
        <picture>
          <source srcSet="/jpf-signature-dark.png" media="(prefers-color-scheme: dark)" />
          {/* Plain img, not next/image — next/image has no built-in way
              to swap sources by a media query the way this <picture>'s
              own <source> above does, and this is a tiny, fixed-size
              local asset with nothing to optimize/resize for. */}
          <img src="/jpf-signature-light.png" alt={siteCopy.footerSignature} width={25} height={30} />
        </picture>
      </a>
    </footer>
  );
}
