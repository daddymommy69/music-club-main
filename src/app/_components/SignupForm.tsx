"use client";

import { useState } from "react";
import Link from "next/link";

type FieldErrors = {
  channel?: string;
  phone?: string;
  consent?: string;
  email?: string;
};

type SuccessState = {
  duplicate: boolean;
  wantsText: boolean;
  wantsEmail: boolean;
};

function digitsOnly(s: string) {
  return s.replace(/\D/g, "");
}

function isValidEmail(s: string) {
  // Deliberately simple — just enough to catch "missing something".
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default function SignupForm({
  nextDropNum,
  daysUntilNext,
  isManual,
}: {
  nextDropNum: number;
  daysUntilNext: number | null;
  isManual: boolean;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [wantsText, setWantsText] = useState(false);
  const [wantsEmail, setWantsEmail] = useState(false);
  const [smsOptIn, setSmsOptIn] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [shakeGen, setShakeGen] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  function clearError(key: keyof FieldErrors) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};

    if (!wantsText && !wantsEmail) {
      next.channel = "Pick text, email, or both";
      return next;
    }

    if (wantsText) {
      if (!phone.trim()) {
        next.phone = "Phone number is required for text updates";
      } else if (digitsOnly(phone).length < 10) {
        next.phone = "That doesn't look like a full phone number";
      } else if (!smsOptIn) {
        next.consent = "Please agree before we can text you";
      }
    }

    if (wantsEmail) {
      if (!email.trim()) {
        next.email = "Email address is required for email updates";
      } else if (!isValidEmail(email.trim())) {
        next.email = "Check that address — it's missing something";
      }
    }

    return next;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const found = validate();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setShakeGen((g) => g + 1);
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, wantsText, wantsEmail, smsOptIn }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrors({ channel: data.error ?? "Something went wrong. Try again." });
        setShakeGen((g) => g + 1);
        setSubmitting(false);
        return;
      }

      setSuccess({
        duplicate: !!data.duplicate,
        // A duplicate is a no-op — reflect what's actually stored for
        // this subscriber, not whatever this submission happened to
        // have checked, so the message never promises a channel that
        // wasn't actually saved.
        wantsText: data.duplicate ? !!data.wantsText : wantsText,
        wantsEmail: data.duplicate ? !!data.wantsEmail : wantsEmail,
      });
    } catch {
      setErrors({ channel: "Something went wrong. Try again." });
      setShakeGen((g) => g + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    const channelWord =
      success.wantsText && success.wantsEmail
        ? "text and email"
        : success.wantsText
          ? "text"
          : "email";

    let headline: string;
    let body: string;
    if (success.duplicate) {
      headline = "You're already in.";
      const timing = isManual
        ? "whenever it's ready"
        : daysUntilNext !== null
          ? `in ${daysUntilNext} day${daysUntilNext === 1 ? "" : "s"}`
          : "soon";
      body = `We already have you on the list, so nothing changed. Drop ${nextDropNum} lands ${timing} and you'll get it by ${channelWord}.`;
    } else if (success.wantsText && success.wantsEmail) {
      headline = "You're in! Watch your phone and your inbox.";
      body = "Every drop, we'll send a link straight to you — nothing else, ever.";
    } else if (success.wantsText) {
      headline = "You're in! Watch your phone for the next drop.";
      body = "We'll text you a link the moment it ships — nothing else, ever.";
    } else {
      headline = "You're in! Watch your inbox for the next drop.";
      body = "We'll email you a link the moment it ships — nothing else, ever.";
    }

    return (
      <div className="signup-success gz-up">
        <div className="success-circle gz-pop">✓</div>
        <div className="success-headline">{headline}</div>
        <p className="mut" style={{ fontSize: 13, lineHeight: 1.65 }}>
          {body}
        </p>
        <hr className="hairline" />
        <Link href="/archive" style={{ fontSize: 12.5, display: "block", marginBottom: 8 }}>
          Hear every drop so far →
        </Link>
        <button
          type="button"
          className="link-btn"
          onClick={() => setSuccess(null)}
        >
          {success.duplicate ? "Wrong number? Sign up again" : "Typo? Fix my details"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="form" noValidate>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <fieldset>
        <legend>How should we send it?</legend>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={wantsText}
            onChange={(e) => {
              setWantsText(e.target.checked);
              clearError("channel");
            }}
          />
          Text message
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={wantsEmail}
            onChange={(e) => {
              setWantsEmail(e.target.checked);
              clearError("channel");
            }}
          />
          Email
        </label>
      </fieldset>

      {wantsText && (
        <div className="reveal-group gz-up">
          <label>
            Phone number
            <input
              type="tel"
              placeholder="+15551234567"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                clearError("phone");
              }}
            />
          </label>
          {errors.phone && (
            <p key={`phone-${shakeGen}`} className="notice error gz-shake">
              {errors.phone}
            </p>
          )}

          <label className="checkbox" style={{ marginTop: 12 }}>
            <input
              type="checkbox"
              checked={smsOptIn}
              onChange={(e) => {
                setSmsOptIn(e.target.checked);
                clearError("consent");
              }}
            />
            I agree to receive text messages from gooberz music club. Reply STOP anytime
            to unsubscribe.
          </label>
          {errors.consent && (
            <p key={`consent-${shakeGen}`} className="notice error gz-shake">
              {errors.consent}
            </p>
          )}
        </div>
      )}

      {wantsEmail && (
        <div className="reveal-group gz-up">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearError("email");
              }}
            />
          </label>
          {errors.email && (
            <p key={`email-${shakeGen}`} className="notice error gz-shake">
              {errors.email}
            </p>
          )}
        </div>
      )}

      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? "Signing up…" : "Sign me up"}
      </button>

      {errors.channel && (
        <p
          key={`channel-${shakeGen}`}
          className="notice error gz-shake"
          style={{ textAlign: "center" }}
        >
          {errors.channel}
        </p>
      )}

      <p className="mut" style={{ fontSize: 11, textAlign: "center" }}>
        One playlist a drop. No other mail, ever.
      </p>

      <hr className="hairline" style={{ margin: "4px 0" }} />
      <Link href="/curators" style={{ fontSize: 11.5, textAlign: "center" }}>
        Got a curator code? Join as a curator →
      </Link>
    </form>
  );
}
