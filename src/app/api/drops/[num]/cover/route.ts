import { NextResponse } from "next/server";
import { getDefaultClub } from "@/lib/club";
import { getPublicDrop } from "@/lib/archive";
import { buildDropCoverJpegBase64 } from "@/lib/dropCover";

/**
 * Public, unauthenticated image endpoint — the drop-cover <img> the
 * release email (src/lib/messages.ts's releaseEmailHtml) points at, so
 * an email client can actually fetch it (an embedded base64 image in
 * an email is unreliable across clients; a real URL isn't). Deliberately
 * NOT persisted anywhere: this regenerates the exact same 2x2 artwork
 * grid + drop-number overlay that gets uploaded as the Spotify playlist
 * cover at ship time (src/lib/dropCover.ts, src/lib/spotifyBuild.ts),
 * from the same already-stored per-song artworkUrl values — so there's
 * nothing to keep in sync, and no DB migration needed for this. Only
 * ever cheap in practice: Cache-Control below means a given drop's
 * cover is actually computed once, the first time any email client (or
 * browser) asks for it, and served from cache after that — not
 * recomputed per open.
 *
 * 2026-10-10 — founder's own ask (see claude/next-build.md).
 */
export async function GET(request: Request, { params }: { params: Promise<{ num: string }> }) {
  const { num: numParam } = await params;
  const num = Number(numParam);
  if (!Number.isInteger(num)) {
    return new NextResponse(null, { status: 404 });
  }

  const club = await getDefaultClub();
  const drop = await getPublicDrop(club.id, num);
  if (!drop) {
    return new NextResponse(null, { status: 404 });
  }

  const artworkUrls = drop.songs.slice(0, 4).map((s) => s.artworkUrl);
  const coverBase64 = await buildDropCoverJpegBase64(artworkUrls, num);
  if (!coverBase64) {
    // Same "quietly skip" spirit as everywhere else this builder is
    // used — nothing to show (no artwork at all, or the composite
    // failed) is a 404, not a 500; the email's <img> just won't render
    // anything rather than showing a broken-image icon with an error.
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(Buffer.from(coverBase64, "base64"), {
    headers: {
      "Content-Type": "image/jpeg",
      // A published drop's songs/artwork never change after the fact,
      // so this is safe to cache hard and long — same reasoning as any
      // other immutable, content-addressed-by-drop-number asset.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
