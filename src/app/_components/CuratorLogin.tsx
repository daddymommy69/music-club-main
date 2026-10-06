"use client";

import { useRouter } from "next/navigation";
import { useCodeLogin } from "./useCodeLogin";

export default function CuratorLogin() {
  const router = useRouter();
  const { step, setStep, error, shakeGen, submitting, resent, submitEntry, resendCode, submitCode } =
    useCodeLogin({
      lookupUrl: "/api/curators/lookup",
      verifyUrl: "/api/curators/verify",
      onVerified: () => router.push("/room"),
    });

  async function handleEntrySubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get("email")?.toString().trim() ?? "";
    await submitEntry(email);
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
        onClick={() => setStep({ kind: "entry" })}
        disabled={submitting}
      >
        ← Use a different email
      </button>
    </form>
  );
}
