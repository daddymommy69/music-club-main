import { NextResponse } from "next/server";
import { getSessionCuratorId } from "@/lib/curatorSession";
import { getDefaultClub } from "@/lib/club";
import { disconnectSpotify } from "@/lib/spotify";

/** Clears the stored refresh token — shipping just falls back to the
 * manual paste-the-link flow after this, same as before auto-build
 * existed. Nothing on Spotify's side is revoked by this alone; it only
 * forgets the token on our end (a curator can also revoke the app's
 * access entirely from their Spotify account settings if they want
 * that too). */
export async function POST() {
  const curatorId = await getSessionCuratorId();
  if (!curatorId) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const club = await getDefaultClub();
  await disconnectSpotify(club.id);
  return NextResponse.json({ ok: true });
}
