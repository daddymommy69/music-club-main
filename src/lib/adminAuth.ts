import { timingSafeEqual } from "crypto";

/**
 * Constant-time bearer-token check for the admin/cron routes
 * (/api/send, /api/cron/send, /api/drops). A plain `!==` string compare
 * leaks timing information about how many leading characters matched —
 * cheap to avoid, so we do.
 */
export function checkBearerAuth(request: Request, envVarName: "ADMIN_SECRET" | "CRON_SECRET"): boolean {
  const secret = process.env[envVarName];
  if (!secret) return false;

  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  const authBuf = Buffer.from(auth);
  const expectedBuf = Buffer.from(expected);
  if (authBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(authBuf, expectedBuf);
}
