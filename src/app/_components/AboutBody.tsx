"use client";

import { useRouter } from "next/navigation";

/**
 * Renders the About page's admin-authored HTML (src/lib/copy.ts's
 * renderAboutHtml — see that function's own comment on why this is the
 * one place in the app trusting dangerouslySetInnerHTML) and intercepts
 * clicks on its own [label](url) links so they go through the router
 * instead of a real browser navigation.
 *
 * 2026-11-04 — founder's own report: clicking "archives" on the About
 * page stopped whatever was playing. Cause: those links render as
 * plain `<a href="...">` tags (renderAboutHtml has no way to reach for
 * next/link — it's building a raw HTML string, not JSX), and a plain
 * `<a>` to a same-site path is a full browser navigation, which
 * remounts the whole app from scratch — NowPlayingProvider, the
 * Spotify embed/SDK connection, all of it — same as hitting refresh
 * mid-song. Every other link on the site either opens in a new tab
 * (external links; see that search elsewhere) or genuinely has to
 * leave the page (Spotify OAuth connect), so this About-body click
 * handler is the only case that needed fixing: an internal relative
 * link just gets router.push()'d instead, same as if it were a real
 * <Link>, and anything else (external, mailto, target=_blank) is left
 * completely alone.
 */
export default function AboutBody({ html }: { html: string }) {
  const router = useRouter();

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const link = (e.target as HTMLElement).closest("a");
    if (!link) return;

    const href = link.getAttribute("href");
    if (!href || !href.startsWith("/") || link.target === "_blank") return;

    // Plain left-click only — let cmd/ctrl/shift-click and middle-click
    // keep doing whatever the browser normally does with those (open in
    // a new tab, etc.) rather than hijacking every modified click too.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    e.preventDefault();
    router.push(href);
  }

  return <div dangerouslySetInnerHTML={{ __html: html }} onClick={handleClick} />;
}
