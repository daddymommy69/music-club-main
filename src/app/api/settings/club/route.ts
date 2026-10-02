import { NextResponse } from "next/server";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub, updateClub } from "@/lib/club";
import { isCycleValue } from "@/lib/cycle";
import type { Club } from "@/db/schema";

const MAX_NAME_LENGTH = 80;
const MAX_CUSTOM_DAYS = 3650; // ~10 years — generous ceiling, just guards against typos/garbage

/** #/settings (design-handoff.md §9): club rename + cycle picker. Both
 * save independently and immediately — there's no single "Save" for the
 * whole page, matching the inline-rename / click-a-pill interactions
 * the handoff describes. */
export async function PUT(request: Request) {
  const curator = await getSessionMember();
  if (!curator || !curator.isCurator) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const club = await getDefaultClub();
  if (curator.clubId !== club.id) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = body as
    | { name?: string; cycle?: string; cycleCustomDays?: number }
    | null;

  const changes: Partial<Pick<Club, "name" | "cycle" | "cycleCustomDays">> = {};

  if (parsed?.name !== undefined) {
    const name = parsed.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Club name can't be empty" }, { status: 400 });
    }
    if (name.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: "That name's too long" }, { status: 400 });
    }
    changes.name = name;
  }

  if (parsed?.cycle !== undefined) {
    if (!isCycleValue(parsed.cycle)) {
      return NextResponse.json({ error: "Not a valid cycle" }, { status: 400 });
    }
    changes.cycle = parsed.cycle;
    // Clearing stale custom-days when switching away from custom, so the
    // DB row never shows a leftover number that no longer means anything.
    if (parsed.cycle !== "custom") {
      changes.cycleCustomDays = null;
    }
  }

  if (parsed?.cycleCustomDays !== undefined) {
    const days = parsed.cycleCustomDays;
    if (!Number.isInteger(days) || days < 1 || days > MAX_CUSTOM_DAYS) {
      return NextResponse.json({ error: "Enter a real number of days" }, { status: 400 });
    }
    changes.cycleCustomDays = days;
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // A custom cycle with no day count is meaningless — getCycleDays would
  // return null and every countdown would silently look like manual mode.
  const nextCycle = changes.cycle ?? club.cycle;
  const nextCustomDays =
    changes.cycleCustomDays !== undefined ? changes.cycleCustomDays : club.cycleCustomDays;
  if (nextCycle === "custom" && !nextCustomDays) {
    return NextResponse.json(
      { error: "Enter how many days between drops" },
      { status: 400 }
    );
  }

  const updated = await updateClub(club.id, changes);

  return NextResponse.json({
    ok: true,
    club: { name: updated.name, cycle: updated.cycle, cycleCustomDays: updated.cycleCustomDays },
  });
}
