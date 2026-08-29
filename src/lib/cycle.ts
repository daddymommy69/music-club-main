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
