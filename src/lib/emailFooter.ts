import { siteUrl } from "@/lib/site";

/**
 * Branded footer appended to every email by sendEmail() (src/lib/email.ts).
 * Images live in public/email/ and are linked by absolute URL (not
 * attached), so NEXT_PUBLIC_SITE_URL must be the real deployed domain for
 * them to load in inboxes.
 *
 * The "project music club" name is a PNG wordmark set in Jacob's own font
 * (Ice City Architekt), because Gmail/Outlook ignore custom web fonts. Its
 * alt text keeps it readable when images are blocked.
 *
 * Table-based layout with inline styles only — email clients strip <style>
 * blocks and flexbox.
 */
const GREEN = "#008856";
const TINT = "#e6f3ee";
const INSTAGRAM_HANDLE = "project.music.club";

export function emailFooterHtml(): string {
  const home = siteUrl("/");
  const img = (file: string) => siteUrl(`/email/${file}`);
  const latestDrop = siteUrl("/releases");

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;margin:32px auto 0;border-collapse:collapse;">
  <tr>
    <td style="background:${TINT};border-radius:12px;padding:20px 22px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td valign="middle" style="padding-right:16px;">
            <a href="${home}" style="text-decoration:none;"><img src="${img("logo.png")}" width="48" height="48" alt="#" style="display:block;border:0;"></a>
          </td>
          <td valign="middle" style="font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:13px;line-height:1.6;color:${GREEN};">
            <a href="${home}" style="text-decoration:none;color:${GREEN};"><img src="${img("wordmark.png")}" width="238" height="22" alt="project music club" style="display:block;border:0;font-family:'JetBrains Mono',monospace;font-size:16px;color:${GREEN};"></a>
            <div style="padding-top:6px;">
              <a href="${latestDrop}" style="color:${GREEN};text-decoration:underline;">Hear the latest drop &rarr;</a>
            </div>
            <div style="padding-top:4px;">
              <a href="https://instagram.com/${INSTAGRAM_HANDLE}" style="color:${GREEN};text-decoration:none;"><img src="${img("instagram.png")}" width="16" height="16" alt="" style="vertical-align:-3px;border:0;">&nbsp;@${INSTAGRAM_HANDLE}</a>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:16px 0 4px;">
      <img src="${img("jpf-stamp.png")}" width="24" height="24" alt="made by JPF" style="display:inline-block;border:0;opacity:.85;">
    </td>
  </tr>
</table>`;
}

/** Appends the footer — before </body> if the template is a full document. */
export function withEmailFooter(html: string): string {
  const footer = emailFooterHtml();
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${footer}</body>`) : html + footer;
}
