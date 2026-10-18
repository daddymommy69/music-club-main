/**
 * Centralized site copy (2026-10-18 — founder's own ask: a single place
 * to tweak the site's wording himself, after flagging he didn't like
 * the auto-filled blurb placeholder text and didn't want to have to
 * ask for a code change every time he wants to adjust a line). Every
 * value here is a plain, literal string on purpose — nothing with live
 * interpolated data (the About page's drop/song/artist count sentence
 * stays hand-written in that page, not here) — so the admin-only
 * /admin/copy editor can safely show each one in a textarea and
 * regenerate this exact file from whatever's typed in, with no risk of
 * mangling a template or breaking a live stat.
 *
 * /admin/copy doesn't write to the database or deploy anything itself
 * — per the founder's own description of what he wanted ("in claude
 * tool that i can change and download to update on github"), it
 * generates an updated copy.ts to download, which then goes through
 * the same manual GitHub-upload flow as every other change to this
 * site. Don't hand-edit the values below without also keeping
 * /admin/copy's key list (CopyEditorForm.tsx's FIELD_LABELS) in sync —
 * a key here with no matching label just won't show up in the editor.
 */
export const siteCopy = {
  // Shown at the very top of the home/releases page, above the drop
  // list (2026-10-18 — founder's own goal: "i want people to
  // understand what the website is when they open it up on the drops
  // page"). Deliberately short — the page's real job is showing the
  // drops, not re-explaining the whole site; /about still exists for
  // anyone who wants the longer version, linked right under this.
  homeIntro:
    "a music club for friends. every so often a drop gets picked and shipped — here's everything so far.",
  // The one-line tagline under the wordmark in the header, and the
  // fallback page description wherever a more specific one (like
  // /releases's live drop/song/artist count) isn't available.
  tagline: "curated by jacob & friends",
  // The site-wide bottom-right signature (SiteFooter.tsx).
  footerSignature: "powered by jacob fogelhut",
  // Curator-tools blurb composer placeholders (CuratorToolsPanel.tsx) —
  // the founder's own flagged example: "the fill in for the blurbs i
  // want to change... i dont like the description it auto pops up."
  dropBlurbPlaceholder:
    "What's this drop about? Any notes you want to say about the songs, or your own thoughts — think of this as a musical journal, let it spill.",
  songBlurbPlaceholder:
    "Any notes you want to say about this song, or your thoughts — think of this as a musical journal, let it spill.",
};

export type SiteCopyKey = keyof typeof siteCopy;
