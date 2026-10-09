import { describe, it, expect } from "vitest";
import { getCycleDays, isCycleValue, CYCLE_OPTIONS } from "./cycle";

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
