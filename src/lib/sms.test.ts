import { describe, it, expect, beforeAll } from "vitest";
import twilio from "twilio";
import { isValidTwilioRequest } from "./sms";

const URL = "https://example.club/api/sms/inbound";
const PARAMS = { From: "+15551234567", Body: "STOP" };

describe("isValidTwilioRequest", () => {
  beforeAll(() => {
    process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
  });

  it("accepts a request signed with the auth token", () => {
    const sig = twilio.getExpectedTwilioSignature("test-auth-token", URL, PARAMS);
    expect(isValidTwilioRequest(sig, URL, PARAMS)).toBe(true);
  });

  it("rejects a missing signature", () => {
    expect(isValidTwilioRequest(null, URL, PARAMS)).toBe(false);
  });

  it("rejects a signature made with a different token", () => {
    const sig = twilio.getExpectedTwilioSignature("wrong-token", URL, PARAMS);
    expect(isValidTwilioRequest(sig, URL, PARAMS)).toBe(false);
  });

  it("rejects a request whose params were tampered with", () => {
    const sig = twilio.getExpectedTwilioSignature("test-auth-token", URL, PARAMS);
    expect(isValidTwilioRequest(sig, URL, { ...PARAMS, From: "+15559999999" })).toBe(false);
  });
});
