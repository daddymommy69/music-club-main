"use client";

import { useRouter } from "next/navigation";
import { useCodeLogin } from "./useCodeLogin";

/**
 * /account's combined signup-or-login card. Built on the same
 * useCodeLogin hook as CuratorLogin.tsx — this one also doubles as
 * signup — see /api/members/lookup's own comment for the judgment
 * call on exactly when a code is required vs. not.
 */
export default function AccountAuth() {
  const router = useRouter();
  const { step, setStep, error, shakeGen, submitting, resent, submitEntry, resendCode, submitCode } =
    useCodeLogin({
      lookupUrl: "/api/members/lookup",
      verifyUrl: "/api/members/verify",
      // Brand-new member — signed up and logged in in one step, no code.
      onCreated: () => router.refresh(),
      onVerified: () => router.refresh(),
    });

  async function handleEntrySubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = data.get("email")?.toString().trim() ?? "";
    const name = data.get("name")?.toString().trim() ?? "";
    await submitEntry(email, { name });
  }

  async function handleCodeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = new FormData(e.currentTarget).get("code")?.toString().trim() ?? "";
    await submitCode(code);
  }

  if (step.kind === "entry") {
    return (
      <form key="entry" onSubmit={handleEntrySubmit} className="form gz-up" noValidate>
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
        onClick={() => setStep({ kind: "entry" })}
        disabled={submitting}
      >
        ← Use a different email
      </button>
    </form>
  );
}
