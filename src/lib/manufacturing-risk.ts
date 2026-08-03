import { createAdminClient } from "@/lib/supabase/admin";
import { loadManufacturingSettings } from "@/lib/manufacturing-scheduler";
import { addWorkingDays } from "@/lib/manufacturing-calendar";
import { emitNotification } from "@/lib/emit-notification";
import { NOTIF_MFG_BEHIND_SCHEDULE } from "@/lib/notification-types";
import { buildManufacturingRiskNotificationBody } from "@/lib/notification-copy";

type RiskChangeRow = {
  unit_id: string;
  new_flag: "yellow" | "red";
  prev_flag: string;
  days_until: number;
  scheduler_id: string | null;
  client_name: string | null;
  building_name: string | null;
  unit_number: string | null;
};

/**
 * Recompute manufacturing_risk_flag for every in-zone unit with an installation
 * date — set-based, in ONE RPC round-trip — then emit a scheduler notification
 * for each unit that newly crossed the risk threshold.
 *
 * Replaces the per-dashboard-view N+1 (computeAndUpdateManufacturingRisk, C2).
 * The working-day math (addWorkingDays with settings/overrides) stays here, in
 * TS, exactly as the old loop computed it; the per-unit days_until is handed to
 * recompute_manufacturing_risk_flags, which applies the identical thresholds
 * set-based and returns only the transitions worth notifying (idempotent — a
 * re-run with unchanged inputs returns nothing, so no duplicate notifications).
 *
 * Runs from the daily cron and, coalesced, from the qc-approve mutation. It uses
 * the service-role admin client (no session in a cron / after() context) and is
 * best-effort: it never throws (risk flags must never break a primary action).
 *
 * @returns the number of scheduler notifications emitted.
 */
export async function recomputeManufacturingRiskFlags(): Promise<number> {
  try {
    const supabase = createAdminClient();
    const { settings, overrides } = await loadManufacturingSettings();
    const overridesByDate = new Map(overrides.map((o) => [o.workDate, o]));

    const { data: units } = await supabase
      .from("units")
      .select("id, installation_date")
      .in("status", ["measured", "bracketed", "manufactured"])
      .not("installation_date", "is", null);

    if (!units || units.length === 0) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = units
      .filter((u) => u.installation_date)
      .map((u) => {
        const targetReadyDate = addWorkingDays(
          u.installation_date as string,
          -3,
          settings,
          overridesByDate
        );
        const readyDate = new Date(targetReadyDate);
        readyDate.setHours(0, 0, 0, 0);
        const daysUntil = Math.floor(
          (readyDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        return { unit_id: u.id, days_until: daysUntil };
      });

    const { data: changed } = await supabase.rpc("recompute_manufacturing_risk_flags", {
      p_days: days,
    });
    const rows = (changed ?? []) as RiskChangeRow[];

    for (const row of rows) {
      if (!row.scheduler_id) continue;
      await emitNotification({
        recipientRole: "scheduler",
        recipientId: row.scheduler_id,
        type: NOTIF_MFG_BEHIND_SCHEDULE,
        title:
          row.new_flag === "red"
            ? "🔴 Blinds at risk for install"
            : "🟡 Manufacturing behind schedule",
        body: buildManufacturingRiskNotificationBody(
          {
            clientName: row.client_name ?? "",
            buildingName: row.building_name ?? "",
            unitNumber: row.unit_number ?? "",
          },
          row.days_until
        ),
        relatedUnitId: row.unit_id,
      });
    }

    return rows.length;
  } catch {
    // Non-fatal — risk flags are best-effort (matches the prior behavior).
    return 0;
  }
}
