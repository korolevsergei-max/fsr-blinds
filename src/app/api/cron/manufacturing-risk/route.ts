import { NextRequest, NextResponse } from "next/server";
import { recomputeManufacturingRiskFlags } from "@/lib/manufacturing-risk";

// Daily recompute of manufacturing_risk_flag (C2). Risk is time-based
// (days-until-install), so it needs a daily tick even when no mutation fires.
// Guarded by CRON_SECRET like /api/cron/daily-snapshot.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");

  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const notified = await recomputeManufacturingRiskFlags();
  return NextResponse.json({ ok: true, notified });
}
