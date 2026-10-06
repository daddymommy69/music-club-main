"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step =
  | { kind: "destination" }
  | { kind: "code"; memberId: number; masked: string; email: string };

export default function CuratorLogin() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "destination" });
  const [error, setError] = useState<string | null>(null);
  const [shakeGen, setShakeGen] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);

  function fail(message: string) {
    setError(message);
    setShakeGen((g) => g + 1);
  }

  async function lookup(email: string) {
    const res = await fetch("/api/curators/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) {
      fail(data.error ?? "Something went wrong. Try again.");
      return false;
    }
    setStep({ kind: "code", memberId: data.memberId, masked: data.masked, email });
    return true;
  }

  async function handleDestinationSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get("email")?.toString().trim() ?? "";
    if (!email) {
      fail("Enter your email");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await lookup(email);
    } catch {
      fail("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // A fresh code for the same email, without going back to re-type it —
  // same /api/curators/lookup call the first request made, which always
  // issues a brand-new code (see issueLoginCode). Doesn't invalidate the
  // old one; it just stops mattering once this new one is what's in the
  // founder/curator's inbox.
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
      const res = await fetch("/api/curators/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: step.memberId, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        fail(data.error ?? "That code isn't right");
        return;
      }
      router.push("/room");
    } catch {
      fail("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step.kind === "destination") {
    return (
      <form key="destination" onSubmit={handleDestinationSubmit} className="form gz-up" noValidate>
        <label>
          Email
          <input name="email" type="email" placeholder="you@example.com" autoFocus />
        </label>
        {error && (
          <p key={`d-${shakeGen}`} className="notice error gz-shake">
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
        <input
          name="code"
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          autoFocus
        />
      </label>
      {resent && (
        <p className="notice" style={{ fontSize: 12 }}>
          New code sent to {step.masked}.
        </p>
      )}
      {error && (
        <p key={`c-${shakeGen}`} className="notice error gz-shake">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? "Verifying…" : "Verify"}
      </button>
      <button type="button" className="link-btn" onClick={resendCode} disabled={submitting}>
        Send a new code
      </button>
      <button
        type="button"
        className="link-btn"
        onClick={() => setStep({ kind: "destination" })}
        disabled={submitting}
      >
        ← Use a different email
      </button>
    </form>
  );
}
