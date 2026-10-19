import { NextResponse } from "next/server";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { getCopyDraft, saveCopyDraft } from "@/lib/copyDraft";

/**
 * Read/write for the admin copy editor's "Save" button (/admin/copy,
 * 2026-10-19). Admin-only, same gate as the page itself — this is
 * scratch storage for Jacob's own in-progress wording, never read by
 * anything the live site renders. Downloading the file is still the
 * only way a change actually reaches the site.
 */
async function authedAdmin() {
  const member = await getSessionMember();
  if (!member || !member.isCurator || !member.isAdmin) {
    return { error: NextResponse.json({ error: "Not authorized" }, { status: 401 }) } as const;
  }
  const club = await getDefaultClub();
  if (member.clubId !== club.id) {
    return { error: NextResponse.json({ error: "Not authorized" }, { status: 401 }) } as const;
  }
  return { club } as const;
}

export async function GET() {
  const auth = await authedAdmin();
  if ("error" in auth) return auth.error;

  try {
    const draft = await getCopyDraft(auth.club.id);
    return NextResponse.json({ draft });
  } catch (err) {
    console.error("Copy draft load failed:", err);
    return NextResponse.json({ error: "Couldn't load your draft. Try again." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await authedAdmin();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.values !== "object" || body.values === null) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Every value gets coerced to a string — a draft is only ever this
  // editor's own textareas round-tripping, so anything else here is
  // malformed input, not a real field.
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(body.values as Record<string, unknown>)) {
    values[key] = typeof value === "string" ? value : String(value ?? "");
  }

  try {
    await saveCopyDraft(auth.club.id, values);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Copy draft save failed:", err);
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  }
}
