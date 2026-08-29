import { NextResponse } from "next/server";
import { verifyLoginCode } from "@/lib/curators";
import { setCuratorSession } from "@/lib/curatorSession";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { curatorId, code } = (body ?? {}) as { curatorId?: number; code?: string };

  if (!curatorId || !code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Enter all 6 digits" }, { status: 400 });
  }

  const ok = await verifyLoginCode(curatorId, code);
  if (!ok) {
    return NextResponse.json({ error: "That code isn't right" }, { status: 400 });
  }

  await setCuratorSession(curatorId);
  return NextResponse.json({ ok: true });
}
