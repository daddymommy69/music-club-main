import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/memberSession";
import { updateMemberProfile } from "@/lib/memberProfile";
import { isSlugAvailable } from "@/lib/members";
import { slugify } from "@/lib/normalize";

/** Updates the signed-in member's profile — name, bio, and/or their
 * public-profile handle (/u/[slug], 2026-10-19). Every field is optional
 * so a caller can send just one; omitting a field leaves it untouched. */
export async function POST(request: Request) {
  const member = await requireMemberSession();
  if (!member) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { name, bio, slug } = (body ?? {}) as { name?: unknown; bio?: unknown; slug?: unknown };

  if (name !== undefined && typeof name !== "string") {
    return NextResponse.json({ error: "name must be a string" }, { status: 400 });
  }
  if (bio !== undefined && typeof bio !== "string") {
    return NextResponse.json({ error: "bio must be a string" }, { status: 400 });
  }
  if (slug !== undefined && typeof slug !== "string") {
    return NextResponse.json({ error: "slug must be a string" }, { status: 400 });
  }

  let normalizedSlug: string | undefined;
  if (slug !== undefined) {
    normalizedSlug = slugify(slug);
    if (!normalizedSlug) {
      return NextResponse.json({ error: "That handle isn't valid" }, { status: 400 });
    }
    // Unlike name/bio, slug is a real unique column — the column's own
    // constraint would reject a collision too, but checking first lets
    // this return a friendly 409 instead of a generic 500.
    if (!(await isSlugAvailable(normalizedSlug, member.id))) {
      return NextResponse.json({ error: "That handle is already taken" }, { status: 409 });
    }
  }

  await updateMemberProfile(member.id, {
    ...(name !== undefined ? { name: name as string } : {}),
    ...(bio !== undefined ? { bio: bio as string } : {}),
    ...(normalizedSlug !== undefined ? { slug: normalizedSlug } : {}),
  });
  return NextResponse.json({ ok: true, slug: normalizedSlug });
}
