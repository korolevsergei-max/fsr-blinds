import type { SupabaseClient } from "@supabase/supabase-js";
import type { WindowManufacturingEscalation } from "@/lib/types";
import { selectInChunks } from "@/lib/supabase-chunking";

type DbLikeClient = SupabaseClient;

type EscalationRow = {
  id: string;
  window_id: string;
  unit_id: string;
  source_role: "cutter" | "assembler" | "qc";
  target_role: "cutter" | "assembler" | "qc";
  escalation_type: "pushback" | "blocker";
  status: "open" | "resolved";
  reason: string | null;
  notes: string | null;
  opened_by_user_id: string | null;
  opened_at: string;
  resolved_by_user_id: string | null;
  resolved_at: string | null;
  created_at: string;
};

export function mapManufacturingEscalation(
  row: EscalationRow
): WindowManufacturingEscalation {
  return {
    id: row.id,
    windowId: row.window_id,
    unitId: row.unit_id,
    sourceRole: row.source_role,
    targetRole: row.target_role,
    escalationType: row.escalation_type,
    status: row.status,
    reason: row.reason ?? "",
    notes: row.notes ?? "",
    openedByUserId: row.opened_by_user_id,
    openedAt: row.opened_at,
    resolvedByUserId: row.resolved_by_user_id,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

export async function syncWindowManufacturingIssue(
  supabase: DbLikeClient,
  windowId: string
): Promise<void> {
  const { data: openRows } = await supabase
    .from("window_manufacturing_escalations")
    .select("*")
    .eq("window_id", windowId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1);

  const latestOpen = (openRows?.[0] as EscalationRow | undefined) ?? null;

  await supabase
    .from("window_production_status")
    .update(
      latestOpen
        ? {
            issue_status: "open",
            issue_reason: latestOpen.reason ?? "",
            issue_notes: latestOpen.notes ?? "",
            issue_reported_by_role: latestOpen.source_role,
            issue_reported_at: latestOpen.opened_at,
            issue_resolved_at: null,
          }
        : {
            issue_status: "resolved",
            issue_reason: "",
            issue_notes: "",
            issue_reported_by_role: null,
            issue_reported_at: null,
            issue_resolved_at: new Date().toISOString(),
          }
    )
    .eq("window_id", windowId);
}

export async function openManufacturingEscalation(
  supabase: DbLikeClient,
  args: {
    windowId: string;
    unitId: string;
    sourceRole: "cutter" | "assembler" | "qc";
    targetRole: "cutter" | "assembler" | "qc";
    reason: string;
    notes: string;
    openedByUserId: string;
  }
): Promise<void> {
  await supabase.from("window_manufacturing_escalations").insert({
    id: `mfg-esc-${crypto.randomUUID().slice(0, 8)}`,
    window_id: args.windowId,
    unit_id: args.unitId,
    source_role: args.sourceRole,
    target_role: args.targetRole,
    escalation_type: "pushback",
    status: "open",
    reason: args.reason.trim(),
    notes: args.notes.trim(),
    opened_by_user_id: args.openedByUserId,
    opened_at: new Date().toISOString(),
  });

  await syncWindowManufacturingIssue(supabase, args.windowId);
}

export async function resolveManufacturingEscalationsForTarget(
  supabase: DbLikeClient,
  args: {
    windowId: string;
    targetRole: "cutter" | "assembler" | "qc";
    resolvedByUserId: string;
  }
): Promise<boolean> {
  const { data } = await supabase
    .from("window_manufacturing_escalations")
    .update({
      status: "resolved",
      resolved_by_user_id: args.resolvedByUserId,
      resolved_at: new Date().toISOString(),
    })
    .eq("window_id", args.windowId)
    .eq("target_role", args.targetRole)
    .eq("status", "open")
    .select("id");

  await syncWindowManufacturingIssue(supabase, args.windowId);
  return Boolean(data?.length);
}

export async function loadOpenManufacturingEscalationsByWindow(
  supabase: DbLikeClient,
  windowIds: string[]
): Promise<Map<string, WindowManufacturingEscalation>> {
  if (windowIds.length === 0) return new Map();

  const rows = await selectInChunks<EscalationRow>(windowIds, (chunk) =>
    supabase
      .from("window_manufacturing_escalations")
      .select("*")
      .in("window_id", chunk)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .then((res) => ({ data: res.data as EscalationRow[] | null, error: res.error })),
  );

  const byWindow = new Map<string, WindowManufacturingEscalation>();
  for (const row of rows) {
    if (!byWindow.has(row.window_id)) {
      byWindow.set(row.window_id, mapManufacturingEscalation(row));
    }
  }
  return byWindow;
}

export async function loadManufacturingEscalationHistoryByWindow(
  supabase: DbLikeClient,
  windowIds: string[]
): Promise<Map<string, WindowManufacturingEscalation[]>> {
  if (windowIds.length === 0) return new Map();

  const rows = await selectInChunks<EscalationRow>(windowIds, (chunk) =>
    supabase
      .from("window_manufacturing_escalations")
      .select("*")
      .in("window_id", chunk)
      .order("opened_at", { ascending: false })
      .then((res) => ({ data: res.data as EscalationRow[] | null, error: res.error })),
  );

  const byWindow = new Map<string, WindowManufacturingEscalation[]>();
  for (const row of rows) {
    const mapped = mapManufacturingEscalation(row);
    const list = byWindow.get(row.window_id) ?? [];
    list.push(mapped);
    byWindow.set(row.window_id, list);
  }
  return byWindow;
}
