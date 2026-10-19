"use client";

import { useEffect, useState } from "react";
import type { siteCopy } from "@/lib/copy";

type SiteCopy = typeof siteCopy;
type FieldKey = keyof SiteCopy;

type Field = { key: FieldKey; label: string; hint?: string; long?: boolean };

/**
 * Every editable field, grouped into the same closed-by-default
 * disclosure sections as the rest of the site (Curators/Top 10/Drop
 * covers in CuratorToolsPanel.tsx) now that there are 30+ of them
 * (2026-10-19 expansion — founder's own ask: "add the areas for
 * everything else on the site that's there right now"). `long` fields
 * get a taller textarea to start — About page text and every email
 * body, since those run several sentences or have HTML/tokens mixed
 * in.
 */
const SECTIONS: { title: string; fields: Field[] }[] = [
  {
    title: "Home",
    fields: [
      { key: "homeIntro", label: "Home page intro", hint: "Shown at the top of the home/releases page." },
      { key: "tagline", label: "Site tagline", hint: "Under the wordmark in the header, and a fallback page description." },
      { key: "footerSignature", label: "Footer signature", hint: "Bottom-right of every page." },
    ],
  },
  {
    title: "About page",
    fields: [
      {
        key: "aboutText",
        label: "About page text",
        hint: 'The whole page. Leave a blank line between paragraphs. Keep {dropCount}, {songCount}, {artistCount}, and the [archives](/releases) / [subscribe](/account) links in place — those still have to point somewhere real.',
        long: true,
      },
    ],
  },
  {
    title: "Curator tools",
    fields: [
      {
        key: "dropBlurbPlaceholder",
        label: "Blurb placeholder — about a drop",
        hint: 'Grayed-out text in the empty "About this drop" box.',
      },
      { key: "songBlurbPlaceholder", label: "Blurb placeholder — about a song", hint: "Same, for each song's own blurb box." },
      {
        key: "curatorHelpText",
        label: "\"help\" disclosure text",
        hint: "The collapsed help note at the top of curator tools. Leave a blank line between paragraphs.",
        long: true,
      },
      { key: "pilePickHint", label: "Submission pile hint", hint: "Always-visible line under \"Submission pile.\"" },
      { key: "emptyPicksText", label: "No picks yet (this cycle)" },
      { key: "emptyPileText", label: "Nothing submitted yet" },
      { key: "addPickSearchPlaceholder", label: "Spotify search placeholder" },
    ],
  },
  {
    title: "Account",
    fields: [
      { key: "noOpenDropText", label: "No drop open for submissions" },
      { key: "noBioText", label: "No bio yet" },
      { key: "namePlaceholder", label: "Name field placeholder" },
      { key: "bioPlaceholder", label: "Bio field placeholder" },
      { key: "noPicksYetText", label: "No picks yet (all time)" },
      { key: "noLikesYetText", label: "No liked songs yet" },
      { key: "noShippedPicksText", label: "No shipped picks yet (leaderboard)" },
      { key: "noShippedDropsText", label: "No shipped drops yet (your tops)" },
    ],
  },
  {
    title: "Settings",
    fields: [
      { key: "cycleManualHint", label: "\"Manual\" cycle hint" },
      { key: "spotifyConnectedHint", label: "Spotify connected hint" },
      { key: "spotifyNotConnectedHint", label: "Spotify not connected hint" },
      { key: "noCuratorsText", label: "No curators yet" },
      { key: "pendingCuratorHint", label: "Pending-curator tag text" },
      { key: "curatorEmailPlaceholder", label: "Curator email field placeholder" },
      { key: "curatorInviteHint", label: "Curator invite explainer" },
    ],
  },
  {
    title: "Emails",
    fields: [
      { key: "welcomeEmailSubject", label: "Welcome email — subject" },
      {
        key: "welcomeEmailBody",
        label: "Welcome email — body",
        hint: "Sent once, right when someone signs up. Keep {currentDropLine} and {websiteUrl} in place.",
        long: true,
      },
      { key: "curatorGrantedEmailSubject", label: "Curator-granted email — subject" },
      {
        key: "curatorGrantedEmailBody",
        label: "Curator-granted email — body",
        hint: "Sent when someone's granted curator status (immediately, or once they sign up after being invited). Keep {curatorLink} in place.",
        long: true,
      },
      { key: "confirmationEmailSubject", label: "Subscribe-confirmation email — subject" },
      {
        key: "confirmationEmailBody",
        label: "Subscribe-confirmation email — body",
        hint: "Sent right after someone subscribes. Keep {clubName} in place.",
        long: true,
      },
      { key: "releaseEmailSubject", label: "Drop-release email — subject" },
      {
        key: "releaseEmailBody",
        label: "Drop-release email — body",
        hint: "The main \"new drop is here\" email. Keep {clubName}, {dropLabel}, {cover}, {notesHtml}, {page}, and {spotifyLink} in place — those are all built from the real drop.",
        long: true,
      },
      { key: "top10ReleaseEmailSubject", label: "Subscriber Top 10 email — subject" },
      {
        key: "top10ReleaseEmailBody",
        label: "Subscriber Top 10 email — body",
        hint: "Keep {dropNum} and {page} in place.",
        long: true,
      },
      { key: "loginCodeEmailSubject", label: "Login-code email — subject" },
      { key: "loginCodeEmailBody", label: "Login-code email — body", hint: "Keep {code} in place.", long: true },
    ],
  },
];

const ALL_KEYS = SECTIONS.flatMap((s) => s.fields.map((f) => f.key));

/**
 * Builds the literal source text of an updated src/lib/copy.ts from
 * whatever's currently in the form (2026-10-18, expanded 2026-10-19).
 * JSON.stringify gives every value a safely-escaped double-quoted
 * string literal — handles quotes, newlines, backslashes, anything
 * typed — without needing to preserve the original file's exact
 * formatting. Field order always matches ALL_KEYS above, not whatever
 * order React state happens to iterate in, so re-downloads stay stable
 * to diff.
 */
function buildCopyFileText(values: Record<string, string>): string {
  const lines = ALL_KEYS.map((key) => `  ${key}: ${JSON.stringify(values[key] ?? "")},`).join("\n");
  return `/**\n * Centralized site copy — generated by the admin copy editor\n * (/admin/copy). Edit through that page, not by hand, so the two\n * never drift: download the updated file there and drop it into\n * your next GitHub upload at this exact path (src/lib/copy.ts).\n *\n * The editor's render helpers (renderTemplate/renderAboutHtml/\n * splitParagraphs) aren't part of what it edits — keep those below\n * if you ever hand-edit this file for some other reason.\n */\nexport const siteCopy = {\n${lines}\n};\n\nexport type SiteCopyKey = keyof typeof siteCopy;\n\nexport function renderTemplate(template: string, tokens: Record<string, string>): string {\n  return template.replace(/\\{(\\w+)\\}/g, (match, key: string) => (key in tokens ? tokens[key] : match));\n}\n\nexport function renderAboutHtml(template: string, tokens: Record<string, string>): string {\n  const filled = renderTemplate(template, tokens);\n  return filled\n    .split(/\\n\\s*\\n/)\n    .map((p) => p.trim())\n    .filter(Boolean)\n    .map((p) => p.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" class="about-link">$1</a>'))\n    .map((p) => \`<p>\${p}</p>\`)\n    .join("\\n");\n}\n\nexport function splitParagraphs(text: string): string[] {\n  return text\n    .split(/\\n\\s*\\n/)\n    .map((p) => p.trim())\n    .filter(Boolean);\n}\n`;
}

export default function CopyEditorForm({ initial }: { initial: SiteCopy }) {
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  // Load any saved draft on open, merged over the live defaults —
  // a draft only ever holds the keys it was saved with, so a field
  // added after an old draft was saved still falls back to its live
  // default instead of showing blank (2026-10-19).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/copy-draft");
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.draft) {
          setValues((v) => ({ ...v, ...data.draft }));
        } else if (!res.ok) {
          setDraftLoadError("Couldn't load your saved draft — starting from what's live.");
        }
      } catch {
        if (!cancelled) setDraftLoadError("Couldn't load your saved draft — starting from what's live.");
      } finally {
        if (!cancelled) setLoadingDraft(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function update(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setDownloaded(false);
    setSavedAt(null);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/admin/copy-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.error ?? "Couldn't save that. Try again.");
        return;
      }
      setSavedAt(new Date());
    } catch {
      setSaveError("Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function download() {
    const text = buildCopyFileText(values);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "copy.ts";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }

  function toggleSection(title: string) {
    setOpenSections((s) => ({ ...s, [title]: !s[title] }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {loadingDraft && (
        <p className="mut" style={{ fontSize: 11.5 }}>
          Loading your saved draft…
        </p>
      )}
      {draftLoadError && <p className="notice error">{draftLoadError}</p>}

      {SECTIONS.map((section) => {
        const open = !!openSections[section.title];
        return (
          <div key={section.title} className="ct-card">
            <button
              type="button"
              className="ct-disclosure"
              onClick={() => toggleSection(section.title)}
              aria-expanded={open}
            >
              <span className="label" style={{ marginBottom: 0 }}>
                {section.title} ({section.fields.length})
              </span>
              <span className="mut" style={{ fontSize: 11 }}>
                {open ? "▲" : "▼"}
              </span>
            </button>
            {open && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 14 }}>
                {section.fields.map(({ key, label, hint, long }) => (
                  <div key={key}>
                    <p className="label" style={{ marginBottom: 4 }}>
                      {label}
                    </p>
                    {hint && (
                      <p className="mut" style={{ fontSize: 11, marginBottom: 8, lineHeight: 1.5 }}>
                        {hint}
                      </p>
                    )}
                    <textarea
                      className="settings-input"
                      style={{
                        resize: "vertical",
                        padding: "10px 12px",
                        lineHeight: 1.6,
                        minHeight: long ? 120 : 50,
                      }}
                      value={values[key] ?? ""}
                      onChange={(e) => update(key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
        <button type="button" className="btn" style={{ width: "auto" }} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-primary" style={{ width: "auto" }} onClick={download}>
          Download updated copy.ts
        </button>
      </div>
      {saveError && <p className="notice error">{saveError}</p>}
      {savedAt && !saveError && (
        <p className="mut" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
          Saved — it&rsquo;ll be here next time you open this page, on any device. Still doesn&rsquo;t
          change the live site until you download and upload it.
        </p>
      )}
      {downloaded && (
        <p className="mut" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
          Downloaded. Drop it into your next upload at <code>src/lib/copy.ts</code> — same spot as the
          current one — to make these changes live.
        </p>
      )}
    </div>
  );
}
