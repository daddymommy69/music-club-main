/**
 * Cycle-length lookup, per the design handoff: `cycle` is one of seven
 * options. "manual" means no scheduled date at all — every screen that
 * would show a countdown has to degrade gracefully instead.
 */
const CYCLE_DAYS: Record<"weekly" | "biweekly" | "monthly" | "every45" | "quarterly", number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  every45: 45,
  quarterly: 91,
};

export function getCycleDays(club: {
  cycle: string;
  cycleCustomDays: number | null;
}): number | null {
  if (club.cycle === "manual") return null;
  if (club.cycle === "custom") return club.cycleCustomDays ?? null;
  return CYCLE_DAYS[club.cycle as keyof typeof CYCLE_DAYS] ?? null;
}

/** All seven cycle values in the order #/settings' pill grid shows them.
 * Shared between the API route (validation) and the settings UI (labels)
 * so the two never drift apart. */
export const CYCLE_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every two weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "every45", label: "Every 45 days" },
  { value: "quarterly", label: "Quarterly" },
  { value: "custom", label: "Custom" },
  { value: "manual", label: "Manual" },
] as const;

export type CycleValue = (typeof CYCLE_OPTIONS)[number]["value"];

export function isCycleValue(value: string): value is CycleValue {
  return CYCLE_OPTIONS.some((o) => o.value === value);
}

/**
 * "Automate the cycle" round (2026-10-24 — founder's own ask, after
 * the drop that was supposed to auto-ship didn't: a real cycle length
 * only ever drove the display countdown, never actually scheduled
 * anything). Starting a drop now auto-fills its ship date this many
 * days out, same length Settings already shows for the countdown —
 * null (no auto-fill at all) whenever the club is in Manual mode or
 * has no cycle length configured. Any curator can still edit the
 * result afterward via Schedule Ship; this only decides what a fresh
 * drop starts with.
 */
export function computeAutoShipDate(club: { cycle: string; cycleCustomDays: number | null }): Date | null {
  const days = getCycleDays(club);
  if (!days) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** Gap between a drop actually shipping and the next one auto-opening
 * (2026-10-24 "automate the cycle" round) — the founder's own flat "2
 * days" answer, deliberately NOT tied to cycle length (a 91-day
 * quarterly cycle shouldn't mean a 91-day gap before the next drop can
 * even open). Any curator can still override the result by hand via
 * Schedule Open once nothing's open. */
export const AUTO_OPEN_GAP_DAYS = 2;

export function computeAutoOpenDate(): Date {
  return new Date(Date.now() + AUTO_OPEN_GAP_DAYS * 24 * 60 * 60 * 1000);
}
