import { NextResponse } from "next/server";
import { getDefaultClub } from "@/lib/club";
import {
  detectDestinationType,
  findCuratorByDestination,
  issueLoginCode,
  maskDestination,
} from "@/lib/curators";

/** Step 1 of curator login: does this phone/email belong to an existing curator? */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const destination = (body as { destination?: string } | null)?.destination?.trim();

  if (!destination) {
    return NextResponse.json({ error: "Enter a phone number or email" }, { status: 400 });
  }

  const club = await getDefaultClub();
  const type = detectDestinationType(destination);
  const curator = await findCuratorByDestination(club, type, destination);

  if (!curator) {
    return NextResponse.json({ status: "new", destinationType: type });
  }

  await issueLoginCode(curator, type, destination);

  return NextResponse.json({
    status: "existing",
    curatorId: curator.id,
    masked: maskDestination(type, destination),
  });
}
