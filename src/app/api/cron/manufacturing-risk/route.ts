import { NextRequest, NextResponse } from "next/server";
import { recomputeManufacturingRiskFlags } from "@/lib/manufacturing-risk";
import { createAdminClient } from "@/lib/supabase/admin";

// Daily recompute of manufacturing_risk_flag (C2). Risk is time-based
// (days-until-install), so it needs a daily tick even when no mutation fires.
// Guarded by CRON_SECRET like /api/cron/daily-snapshot.
//
// Also carries the C1 archive move. window_manufacturing_schedule grows ~+41
// rows/day and is never pruned, so a one-off manual archive decays back to an
// O(all-time) read within weeks. Both Hobby cron slots are already used, so
// this rides the existing daily tick rather than claiming a third.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");

  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const notified = await recomputeManufacturingRiskFlags();

  // Idempotent: moves only units that have newly reached status='installed'.
  // Reads stay correct either way — the completed views union active∪archive.
  let archived: number | null = null;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("move_completed_schedules_to_archive");
  if (error) {
    console.warn("[mfg] move_completed_schedules_to_archive failed:", error.message);
  } else {
    archived = typeof data === "number" ? data : null;
  }

  return NextResponse.json({ ok: true, notified, archived });
}
