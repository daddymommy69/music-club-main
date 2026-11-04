import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionMember } from "@/lib/memberSession";
import { exchangeVisitorSpotifyCode, saveMemberSpotifyRefreshToken } from "@/lib/visitorSpotify";

const STATE_COOKIE = "gz_visitor_spotify_state";
const POPUP_COOKIE = "gz_visitor_spotify_popup";

type Result = "connected" | "declined" | "error";

/** Tiny standalone page for the popup-window connect flow (2026-11-04
 * — see useSpotifyConnectPopup.ts's own comment) — posts the result
 * back to the tab that opened the popup and closes itself, so that tab
 * never navigates anywhere. Deliberately plain inline HTML, not run
 * through siteCopy — this is a technical hand-off page nobody actually
 * reads for more than a second, not site content. */
function popupResultHtml(result: Result): string {
  const message =
    result === "connected"
      ? "connected — you can close this window."
      : result === "declined"
        ? "declined — you can close this window."
        : "something went wrong — you can close this window and try again.";
  return `<!doctype html><html><head><meta charset="utf-8"><title>Spotify</title></head><body style="background:#131311;color:#eceae4;font-family:ui-monospace,monospace;font-size:13px;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
<p>${message}</p>
<script>
  if (window.opener) {
    window.opener.postMessage({ source: "gz-spotify-connect", status: ${JSON.stringify(result)} }, window.location.origin);
  }
  window.close();
</script>
</body></html>`;
}

/** Spotify redirects back here with ?code= on success or ?error= if the
 * visitor declined. A normal (non-popup) connect lands back on
 * /account with a query param; a popup-window connect (see
 * useSpotifyConnectPopup.ts) gets the tiny self-closing page above
 * instead, so the tab that opened it is never touched. */
export async function GET(request: Request) {
  const member = await getSessionMember();
  if (!member) {
    return NextResponse.redirect(new URL("/account", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value;
  const isPopup = store.get(POPUP_COOKIE)?.value === "1";
  store.delete(STATE_COOKIE);
  store.delete(POPUP_COOKIE);

  let result: Result;
  if (error) {
    result = "declined";
  } else if (!code || !state || !expectedState || state !== expectedState) {
    result = "error";
  } else {
    try {
      const refreshToken = await exchangeVisitorSpotifyCode(code);
      await saveMemberSpotifyRefreshToken(member.id, refreshToken);
      result = "connected";
    } catch {
      result = "error";
    }
  }

  if (isPopup) {
    return new NextResponse(popupResultHtml(result), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const accountUrl = new URL("/account", request.url);
  accountUrl.searchParams.set("spotify", result);
  return NextResponse.redirect(accountUrl);
}
