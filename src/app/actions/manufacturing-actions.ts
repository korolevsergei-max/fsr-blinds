"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addWorkingDays } from "@/lib/manufacturing-calendar";
import {
  loadManufacturingSettings,
  reflowManufacturingSchedules,
} from "@/lib/manufacturing-scheduler";
import { getCurrentUser, requireOwner } from "@/lib/auth";
import type { ManufacturingCalendarOverride } from "@/lib/types";

type ActionResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string; needsConfirmation?: boolean; targetDate?: string; overBy?: number };

function revalidateManufacturingPaths() {
  revalidatePath("/management/settings", "page");
  revalidatePath("/management/schedule", "page");
  revalidatePath("/cutter", "layout");
  revalidatePath("/assembler", "layout");
  revalidatePath("/management", "layout");
}

function overrideMap(overrides: ManufacturingCalendarOverride[]): Map<string, ManufacturingCalendarOverride> {
  return new Map(overrides.map((override) => [override.workDate, override]));
}

async function requireManufacturingUser() {
  const user = await getCurrentUser();
  if (!user || !["owner", "cutter", "assembler"].includes(user.role)) {
    throw new Error("Unauthorized.");
  }
  return user;
}

export async function updateManufacturingSettings(
  cutterDailyCapacity: number,
  assemblerDailyCapacity: number,
  applyOntarioHolidays: boolean
): Promise<ActionResult> {
  try {
    await requireOwner();
    const supabase = await createClient();
    const { error } = await supabase.from("manufacturing_settings").upsert({
      id: "default",
      cutter_daily_capacity: Math.max(0, Math.floor(cutterDailyCapacity)),
      assembler_daily_capacity: Math.max(0, Math.floor(assemblerDailyCapacity)),
      apply_ontario_holidays: applyOntarioHolidays,
    });
    if (error) return { ok: false, error: error.message };

    await reflowManufacturingSchedules("settings_updated");
    revalidateManufacturingPaths();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to update manufacturing settings.",
    };
  }
}

export async function toggleManufacturingWorkday(
  workDate: string,
  isWorking: boolean,
  label = ""
): Promise<ActionResult> {
  try {
    const owner = await requireOwner();
    const supabase = await createClient();

    const existing = await supabase
      .from("manufacturing_calendar_overrides")
      .select("id")
      .eq("work_date", workDate)
      .maybeSingle();

    if (existing.data?.id) {
      const { error } = await supabase
        .from("manufacturing_calendar_overrides")
        .update({
          is_working: isWorking,
          label,
          created_by_user_id: owner.id,
        })
        .eq("id", existing.data.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.from("manufacturing_calendar_overrides").insert({
        id: `mfg-cal-${crypto.randomUUID().slice(0, 8)}`,
        work_date: workDate,
        is_working: isWorking,
        label,
        created_by_user_id: owner.id,
      });
      if (error) return { ok: false, error: error.message };
    }

    await reflowManufacturingSchedules("calendar_updated");
    revalidateManufacturingPaths();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to update workday.",
    };
  }
}

export async function shiftWindowManufacturingSchedule(
  windowId: string,
  role: "cutter" | "assembler",
  direction: "earlier" | "later",
  reason: string,
  force = false
): Promise<ActionResult> {
  try {
    const user = await requireManufacturingUser();
    const supabase = await createClient();
    const { settings, overrides } = await loadManufacturingSettings();
    const overridesByDate = overrideMap(overrides);

    const { data: row, error } = await supabase
      .from("window_manufacturing_schedule")
      .select("*")
      .eq("window_id", windowId)
      .maybeSingle();
    if (error || !row) {
      return { ok: false, error: "Manufacturing schedule row not found." };
    }

    const step = direction === "earlier" ? -1 : 1;
    const currentCut = row.scheduled_cut_date ?? null;
    const currentAssembly = row.scheduled_assembly_date ?? row.target_ready_date ?? null;
    if (!currentAssembly && !currentCut) {
      return { ok: false, error: "This blind is not scheduled yet." };
    }

    const nextCut = currentCut
      ? addWorkingDays(currentCut, step, settings, overridesByDate)
      : null;
    let nextAssembly = currentAssembly
      ? addWorkingDays(currentAssembly, step, settings, overridesByDate)
      : null;

    if (nextCut && nextAssembly && nextCut >= nextAssembly) {
      nextAssembly = addWorkingDays(nextCut, 1, settings, overridesByDate);
    }

    const targetDate = role === "cutter" ? nextCut : nextAssembly;
    const cap =
      role === "cutter" ? settings.cutterDailyCapacity : settings.assemblerDailyCapacity;

    if (targetDate) {
      const dateColumn =
        role === "cutter" ? "scheduled_cut_date" : "scheduled_assembly_date";
      const { count } = await supabase
        .from("window_manufacturing_schedule")
        .select("id", { count: "exact", head: true })
        .eq(dateColumn, targetDate)
        .neq("window_id", windowId);
      const nextCount = (count ?? 0) + 1;
      if (nextCount > cap && !force) {
        return {
          ok: false,
          error: "This move would exceed capacity.",
          needsConfirmation: true,
          targetDate,
          overBy: nextCount - cap,
        };
      }
    }

    const { error: updateError } = await supabase
      .from("window_manufacturing_schedule")
      .update({
        scheduled_cut_date: nextCut,
        scheduled_assembly_date: nextAssembly,
        is_schedule_locked: true,
        lock_reason: reason.trim(),
        last_reschedule_reason: reason.trim(),
        over_capacity_override: Boolean(targetDate),
        moved_by_user_id: user.id,
        moved_at: new Date().toISOString(),
      })
      .eq("window_id", windowId);
    if (updateError) return { ok: false, error: updateError.message };

    await reflowManufacturingSchedules("manual_shift");
    revalidateManufacturingPaths();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to move scheduled blind.",
    };
  }
}

export async function markWindowManufacturingIssue(
  windowId: string,
  reason: string,
  notes = ""
): Promise<ActionResult> {
  try {
    const user = await requireManufacturingUser();
    const supabase = await createClient();

    const { data: windowRow } = await supabase
      .from("windows")
      .select("id, room_id, rooms!inner(unit_id)")
      .eq("id", windowId)
      .single();
    if (!windowRow) return { ok: false, error: "Window not found." };
    const rooms = windowRow.rooms as unknown as { unit_id: string } | { unit_id: string }[];
    const unitId = Array.isArray(rooms) ? rooms[0]?.unit_id : rooms?.unit_id;
    if (!unitId) return { ok: false, error: "Unable to resolve unit." };

    const { data: existing } = await supabase
      .from("window_production_status")
      .select("id, status")
      .eq("window_id", windowId)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from("window_production_status")
        .update({
          issue_status: "open",
          issue_reason: reason.trim(),
          issue_notes: notes.trim(),
          issue_reported_by_role: user.role,
          issue_reported_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.from("window_production_status").insert({
        id: `wps-${crypto.randomUUID().slice(0, 8)}`,
        window_id: windowId,
        unit_id: unitId,
        status: "pending",
        issue_status: "open",
        issue_reason: reason.trim(),
        issue_notes: notes.trim(),
        issue_reported_by_role: user.role,
        issue_reported_at: new Date().toISOString(),
      });
      if (error) return { ok: false, error: error.message };
    }

    await reflowManufacturingSchedules("issue_opened");
    revalidateManufacturingPaths();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to mark issue.",
    };
  }
}

export async function resolveWindowManufacturingIssue(windowId: string): Promise<ActionResult> {
  try {
    await requireManufacturingUser();
    const supabase = await createClient();
    const { error } = await supabase
      .from("window_production_status")
      .update({
        issue_status: "resolved",
        issue_resolved_at: new Date().toISOString(),
      })
      .eq("window_id", windowId);
    if (error) return { ok: false, error: error.message };

    await reflowManufacturingSchedules("issue_resolved");
    revalidateManufacturingPaths();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to resolve issue.",
    };
  }
}

async function loadWindowProduction(windowId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("window_production_status")
    .select("*")
    .eq("window_id", windowId)
    .maybeSingle();
  return { supabase, row: data };
}

export async function undoWindowCut(windowId: string): Promise<ActionResult> {
  try {
    await requireManufacturingUser();
    const { supabase, row } = await loadWindowProduction(windowId);
    if (!row || row.status !== "cut") {
      return { ok: false, error: "Only cut blinds can be undone." };
    }
    const { error } = await supabase
      .from("window_production_status")
      .update({
        status: "pending",
        cut_by_cutter_id: null,
        cut_at: null,
        cut_notes: "",
      })
      .eq("window_id", windowId);
    if (error) return { ok: false, error: error.message };

    await reflowManufacturingSchedules("undo_cut");
    revalidateManufacturingPaths();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to undo cut.",
    };
  }
}

export async function undoWindowAssembly(windowId: string): Promise<ActionResult> {
  try {
    await requireManufacturingUser();
    const { supabase, row } = await loadWindowProduction(windowId);
    if (!row || row.status !== "assembled") {
      return { ok: false, error: "Only assembled blinds can be undone." };
    }
    const { error } = await supabase
      .from("window_production_status")
      .update({
        status: "cut",
        assembled_by_assembler_id: null,
        assembled_at: null,
        assembled_notes: "",
      })
      .eq("window_id", windowId);
    if (error) return { ok: false, error: error.message };

    await reflowManufacturingSchedules("undo_assembly");
    revalidateManufacturingPaths();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to undo assembly.",
    };
  }
}

export async function undoWindowQC(windowId: string): Promise<ActionResult> {
  try {
    await requireManufacturingUser();
    const { supabase, row } = await loadWindowProduction(windowId);
    if (!row || row.status !== "qc_approved") {
      return { ok: false, error: "Only QC-approved blinds can be undone." };
    }
    const { error } = await supabase
      .from("window_production_status")
      .update({
        status: "assembled",
        qc_approved_by_assembler_id: null,
        qc_approved_at: null,
        qc_notes: "",
      })
      .eq("window_id", windowId);
    if (error) return { ok: false, error: error.message };

    await reflowManufacturingSchedules("undo_qc");
    revalidateManufacturingPaths();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to undo QC.",
    };
  }
}
