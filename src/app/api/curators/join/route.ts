import { NextResponse } from "next/server";
import { getDefaultClub } from "@/lib/club";
import {
  createCurator,
  detectDestinationType,
  findCuratorByDestination,
  issueLoginCode,
  maskDestination,
} from "@/lib/curators";

/** First-run: join code + profile, then send the same six-digit code as an existing curator would get. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { joinCode, name, destination } = (body ?? {}) as {
    joinCode?: string;
    name?: string;
    destination?: string;
  };

  if (!joinCode || !joinCode.trim()) {
    return NextResponse.json({ error: "Enter your club's join code" }, { status: 400 });
  }
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!destination || !destination.trim()) {
    return NextResponse.json({ error: "Enter a phone number or email" }, { status: 400 });
  }

  const club = await getDefaultClub();
  if (joinCode.trim().toUpperCase() !== club.joinCode.toUpperCase()) {
    return NextResponse.json({ error: "That join code doesn't match" }, { status: 400 });
  }

  const type = detectDestinationType(destination);

  // Same rigor as /api/subscribe — a destination that isn't a real phone
  // or email would otherwise "join" successfully and just silently never
  // receive a login code.
  if (type === "phone") {
    const digits = destination.replace(/\D/g, "");
    if (digits.length < 10) {
      return NextResponse.json(
        { error: "That doesn't look like a full phone number" },
        { status: 400 }
      );
    }
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination.trim())) {
    return NextResponse.json(
      { error: "Check that address — it's missing something" },
      { status: 400 }
    );
  }

  // Someone re-running first-run with a destination that's since been
  // added — treat it as the existing curator rather than a duplicate.
  const existing = await findCuratorByDestination(club, type, destination);
  const curator = existing ?? (await createCurator(club, name, type, destination));

  await issueLoginCode(curator, type, destination);

  return NextResponse.json({
    curatorId: curator.id,
    masked: maskDestination(type, destination),
  });
}
