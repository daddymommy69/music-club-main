import { describe, it, expect } from "vitest";
import { getCycleDays, isCycleValue, CYCLE_OPTIONS, computeAutoShipDate, computeAutoOpenDate, AUTO_OPEN_GAP_DAYS } from "./cycle";

describe("getCycleDays", () => {
  it("returns null for manual, regardless of cycleCustomDays", () => {
    expect(getCycleDays({ cycle: "manual", cycleCustomDays: 99 })).toBeNull();
  });

  it("returns the custom day count for custom", () => {
    expect(getCycleDays({ cycle: "custom", cycleCustomDays: 23 })).toBe(23);
  });

  it("returns null for custom with no cycleCustomDays set", () => {
    expect(getCycleDays({ cycle: "custom", cycleCustomDays: null })).toBeNull();
  });

  it.each([
    ["weekly", 7],
    ["biweekly", 14],
    ["monthly", 30],
    ["every45", 45],
    ["quarterly", 91],
  ])("maps %s to %i days", (cycle, days) => {
    expect(getCycleDays({ cycle, cycleCustomDays: null })).toBe(days);
  });

  it("returns null for an unrecognized cycle value", () => {
    expect(getCycleDays({ cycle: "bogus", cycleCustomDays: null })).toBeNull();
  });
});

describe("computeAutoShipDate", () => {
  it("returns null in manual mode", () => {
    expect(computeAutoShipDate({ cycle: "manual", cycleCustomDays: 21 })).toBeNull();
  });

  it("returns null when custom has no day count set", () => {
    expect(computeAutoShipDate({ cycle: "custom", cycleCustomDays: null })).toBeNull();
  });

  it("returns a date cycleDays out from now for a real cycle", () => {
    const before = Date.now();
    const result = computeAutoShipDate({ cycle: "custom", cycleCustomDays: 21 });
    const after = Date.now();
    expect(result).not.toBeNull();
    const msOut = result!.getTime() - before;
    const expectedMs = 21 * 24 * 60 * 60 * 1000;
    // Allow for the few ms of real time that pass between `before` and
    // the call inside computeAutoShipDate itself.
    expect(msOut).toBeGreaterThanOrEqual(expectedMs);
    expect(msOut).toBeLessThanOrEqual(expectedMs + (after - before));
  });
});

describe("computeAutoOpenDate", () => {
  it("returns a date AUTO_OPEN_GAP_DAYS out from now", () => {
    const before = Date.now();
    const result = computeAutoOpenDate();
    const after = Date.now();
    const msOut = result.getTime() - before;
    const expectedMs = AUTO_OPEN_GAP_DAYS * 24 * 60 * 60 * 1000;
    expect(msOut).toBeGreaterThanOrEqual(expectedMs);
    expect(msOut).toBeLessThanOrEqual(expectedMs + (after - before));
  });
});

describe("isCycleValue", () => {
  it("accepts every value CYCLE_OPTIONS lists", () => {
    for (const { value } of CYCLE_OPTIONS) {
      expect(isCycleValue(value)).toBe(true);
    }
  });

  it("rejects anything not in the list", () => {
    expect(isCycleValue("yearly")).toBe(false);
    expect(isCycleValue("")).toBe(false);
  });
});
