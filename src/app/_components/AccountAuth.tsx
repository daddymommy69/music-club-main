"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step =
  | { kind: "entry" }
  | { kind: "code"; memberId: number; masked: string };

/**
 * /account's combined signup-or-login card. Modeled closely on
 * CuratorLogin.tsx, but this one also doubles as signup — see
 * /api/members/lookup's own comment for the judgment call on exactly
 * when a code is required vs. not.
 */
export default function AccountAuth() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "entry" });
  const [error, setError] = useState<string | null>(null);
  const [shakeGen, setShakeGen] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  function fail(message: string) {
    setError(message);
    setShakeGen((g) => g + 1);
  }

  async function handleEntrySubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = data.get("email")?.toString().trim() ?? "";
    const name = data.get("name")?.toString().trim() ?? "";
    if (!email) {
      fail("Enter your email");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/members/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      const result = await res.json();
      if (!res.ok) {
        fail(result.error ?? "Something went wrong. Try again.");
        return;
      }
      if (result.mode === "created") {
        // Brand-new member — signed up and logged in in one step, no code.
        router.refresh();
        return;
      }
      setStep({ kind: "code", memberId: result.memberId, masked: result.masked });
    } catch {
      fail("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCodeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step.kind !== "code") return;
    const code = new FormData(e.currentTarget).get("code")?.toString().trim() ?? "";

    if (!/^\d{6}$/.test(code)) {
      fail("Enter all 6 digits");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/members/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: step.memberId, code }),
      });
      const result = await res.json();
      if (!res.ok) {
        fail(result.error ?? "That code isn't right");
        return;
      }
      router.refresh();
    } catch {
      fail("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step.kind === "entry") {
    return (
      <form key="entry" onSubmit={handleEntrySubmit} className="form gz-up" noValidate>
        <p className="mut" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          New here? Just enter your name and email — that&rsquo;s your account, no
          password. Already signed up? Enter your email and we&rsquo;ll send you a code.
        </p>
        <label>
          Name
          <input name="name" placeholder="So we know what to call you" autoFocus />
        </label>
        <label>
          Email
          <input name="email" type="email" placeholder="you@example.com" />
        </label>
        {error && (
          <p key={`e-${shakeGen}`} className="notice error gz-shake">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Checking…" : "Continue"}
        </button>
      </form>
    );
  }

  // step.kind === "code"
  return (
    <form key="code" onSubmit={handleCodeSubmit} className="form gz-up" noValidate>
      <p className="mut" style={{ fontSize: 12.5 }}>
        Enter the code we sent to {step.masked}
      </p>
      <label>
        6-digit code
        <input name="code" inputMode="numeric" maxLength={6} placeholder="000000" autoFocus />
      </label>
      {error && (
        <p key={`c-${shakeGen}`} className="notice error gz-shake">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? "Verifying…" : "Verify"}
      </button>
      <button type="button" className="link-btn" onClick={() => setStep({ kind: "entry" })}>
        ← That&rsquo;s not right
      </button>
    </form>
  );
}
