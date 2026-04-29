import { NextRequest, NextResponse } from "next/server";
import { snapshotProgressForDate, todayInToronto } from "@/lib/progress-snapshot";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");

  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const result = await snapshotProgressForDate(todayInToronto());
  return NextResponse.json({ ok: true, ...result });
}
