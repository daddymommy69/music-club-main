"use client";

import { useState } from "react";

export type CodeLoginStep =
  | { kind: "entry" }
  | { kind: "code"; memberId: number; masked: string; email: string };

/**
 * The emailed-6-digit-code login flow, shared between CuratorLogin.tsx
 * (/curators) and AccountAuth.tsx (/account) — the two used to
 * duplicate almost the entire ~170-line flow (lookup, resend, verify,
 * the shake-on-error pattern) with only their endpoints, extra fields,
 * and post-success behavior actually differing (2026-10-06 QA sweep
 * finding). Those differences stay as callback props; everything else
 * — state, the lookup/resend/verify requests, error handling — lives
 * here once.
 */
export function useCodeLogin({
  lookupUrl,
  verifyUrl,
  onCreated,
  onVerified,
}: {
  lookupUrl: string;
  verifyUrl: string;
  /** Called when lookup() reports a brand-new signup that's already
   * logged in with no code needed (only ever reachable from
   * /api/members/lookup — /api/curators/lookup never returns this). */
  onCreated?: () => void;
  onVerified: () => void;
}) {
  const [step, setStep] = useState<CodeLoginStep>({ kind: "entry" });
  const [error, setError] = useState<string | null>(null);
  const [shakeGen, setShakeGen] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);

  function fail(message: string) {
    setError(message);
    setShakeGen((g) => g + 1);
  }

  async function lookup(email: string, extra?: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(lookupUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      fail(data.error ?? "Something went wrong. Try again.");
      return false;
    }
    if (data.mode === "created") {
      onCreated?.();
      return true;
    }
    setStep({ kind: "code", memberId: data.memberId, masked: data.masked, email });
    return true;
  }

  async function submitEntry(email: string, extra?: Record<string, unknown>) {
    if (!email) {
      fail("Enter your email");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await lookup(email, extra);
    } catch {
      fail("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // A fresh code for the same email, without going back to re-type it —
  // the same lookup() call the first request made, which always issues
  // a brand-new code. Doesn't invalidate the old one; it just stops
  // mattering once this new one is what's in the inbox.
  async function resendCode() {
    if (step.kind !== "code") return;
    setError(null);
    setResent(false);
    setSubmitting(true);
    try {
      const ok = await lookup(step.email);
      if (ok) {
        setResent(true);
        setTimeout(() => setResent(false), 4000);
      }
    } catch {
      fail("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCode(code: string) {
    if (step.kind !== "code") return;
    if (!/^\d{6}$/.test(code)) {
      fail("Enter all 6 digits");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(verifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: step.memberId, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        fail(data.error ?? "That code isn't right");
        return;
      }
      onVerified();
    } catch {
      fail("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return {
    step,
    setStep,
    error,
    shakeGen,
    submitting,
    resent,
    submitEntry,
    resendCode,
    submitCode,
  };
}
