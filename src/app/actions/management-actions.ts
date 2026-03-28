"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwner, requireOwnerOrScheduler } from "@/lib/auth";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateApp() {
  revalidatePath("/management", "layout");
  revalidatePath("/installer", "layout");
}

async function logUnitActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string,
  actorRole: string,
  actorName: string,
  action: string,
  details?: Record<string, unknown>
) {
  await supabase.from("unit_activity_log").insert({
    id: `log-${crypto.randomUUID()}`,
    unit_id: unitId,
    actor_role: actorRole,
    actor_name: actorName,
    action,
    details: details ?? null,
    created_at: new Date().toISOString(),
  });
}

export async function createClient_(
  name: string,
  contactName: string,
  contactEmail: string,
  contactPhone: string
): Promise<ActionResult & { id?: string }> {
  try {
    const supabase = await createClient();
    const id = `client-${crypto.randomUUID().slice(0, 8)}`;
    const { error } = await supabase.from("clients").insert({
      id,
      name: name.trim(),
      contact_name: contactName.trim(),
      contact_email: contactEmail.trim(),
      contact_phone: contactPhone.trim(),
    });
    if (error) return { ok: false, error: error.message };
    revalidateApp();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create client" };
  }
}

export async function updateClient(
  clientId: string,
  name: string,
  contactName: string,
  contactEmail: string,
  contactPhone: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("clients")
      .update({
        name: name.trim(),
        contact_name: contactName.trim(),
        contact_email: contactEmail.trim(),
        contact_phone: contactPhone.trim(),
      })
      .eq("id", clientId);
    if (error) return { ok: false, error: error.message };
    revalidateApp();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update client" };
  }
}

export async function deleteClient(clientId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", clientId);
    if (error) return { ok: false, error: error.message };
    revalidateApp();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete client" };
  }
}

export async function createBuilding(
  clientId: string,
  name: string,
  address: string
): Promise<ActionResult & { id?: string }> {
  try {
    const supabase = await createClient();
    const id = `bldg-${crypto.randomUUID().slice(0, 8)}`;
    const { error } = await supabase.from("buildings").insert({
      id,
      client_id: clientId,
      name: name.trim(),
      address: address.trim(),
    });
    if (error) return { ok: false, error: error.message };
    revalidateApp();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create building" };
  }
}

export async function createUnit(
  buildingId: string,
  clientId: string,
  unitNumber: string,
  earliestBracketingDate: string,
  earliestInstallationDate: string,
  completeByDate: string | null = null
): Promise<ActionResult & { id?: string }> {
  try {
    const owner = await requireOwner();
    const supabase = await createClient();

    const { data: building } = await supabase
      .from("buildings")
      .select("name")
      .eq("id", buildingId)
      .single();
    const { data: client } = await supabase
      .from("clients")
      .select("name")
      .eq("id", clientId)
      .single();

    const id = `unit-${crypto.randomUUID().slice(0, 8)}`;
    const { error } = await supabase.from("units").insert({
      id,
      building_id: buildingId,
      client_id: clientId,
      client_name: client?.name ?? "",
      building_name: building?.name ?? "",
      unit_number: unitNumber.trim(),
      status: "pending_scheduling",
      risk_flag: "green",
      earliest_bracketing_date: earliestBracketingDate || null,
      earliest_installation_date: earliestInstallationDate || null,
      complete_by_date: completeByDate || null,
      room_count: 0,
      window_count: 0,
      photos_uploaded: 0,
      notes_count: 0,
    });
    if (error) return { ok: false, error: error.message };

    const bracketEntry = {
      id: `sch-${crypto.randomUUID().slice(0, 8)}`,
      unit_id: id,
      unit_number: unitNumber.trim(),
      building_name: building?.name ?? "",
      client_name: client?.name ?? "",
      owner_user_id: owner.id,
      owner_name: owner.displayName,
      task_type: "bracketing",
      task_date: earliestBracketingDate || "9999-12-31",
      status: "pending_scheduling",
      risk_flag: "green",
    };
    await supabase.from("schedule_entries").insert(bracketEntry);

    revalidateApp();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create unit" };
  }
}

export async function updateUnit(
  unitId: string,
  unitNumber: string,
  earliestBracketingDate: string,
  earliestInstallationDate: string,
  priority?: "low" | "medium" | "high" | null
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("units")
      .update({
        unit_number: unitNumber.trim(),
        earliest_bracketing_date: earliestBracketingDate || null,
        earliest_installation_date: earliestInstallationDate || null,
        priority: priority || null,
      })
      .eq("id", unitId);
    if (error) return { ok: false, error: error.message };
    revalidateApp();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update unit" };
  }
}

export async function updateUnitCompleteByDate(
  unitId: string,
  completeByDate: string | null
): Promise<ActionResult> {
  try {
    const owner = await requireOwnerOrScheduler();
    const supabase = await createClient();
    const nextDate = completeByDate || null;
    const { data: current } = await supabase
      .from("units")
      .select("complete_by_date")
      .eq("id", unitId)
      .single();
    const previousDate = current?.complete_by_date ?? null;

    const { error } = await supabase
      .from("units")
      .update({ complete_by_date: nextDate })
      .eq("id", unitId);

    if (error) return { ok: false, error: error.message };

    if (previousDate !== nextDate) {
      await logUnitActivity(
        supabase,
        unitId,
        owner.role,
        owner.displayName,
        "complete_by_date_set",
        {
          from: previousDate,
          to: nextDate,
        }
      );
    }

    revalidateApp();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function bulkImportUnits(
  buildingId: string,
  clientId: string,
  rows: { unitNumber: string; earliestBracketing: string; earliestInstallation: string; occupancyDate: string }[]
): Promise<{ created: number; skipped: number; errors: string[] }> {
  const owner = await requireOwner();
  const supabase = await createClient();

  const { data: building } = await supabase
    .from("buildings")
    .select("name")
    .eq("id", buildingId)
    .single();
  const { data: client } = await supabase
    .from("clients")
    .select("name")
    .eq("id", clientId)
    .single();

  const { data: existing } = await supabase
    .from("units")
    .select("unit_number")
    .eq("building_id", buildingId);
  const existingNumbers = new Set((existing ?? []).map((u) => u.unit_number));

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    if (!row.unitNumber.trim()) {
      skipped++;
      continue;
    }
    if (existingNumbers.has(row.unitNumber.trim())) {
      skipped++;
      continue;
    }

    const unitId = `unit-${crypto.randomUUID().slice(0, 8)}`;
    const { error } = await supabase.from("units").insert({
      id: unitId,
      building_id: buildingId,
      client_id: clientId,
      client_name: client?.name ?? "",
      building_name: building?.name ?? "",
      unit_number: row.unitNumber.trim(),
      status: "pending_scheduling",
      risk_flag: "green",
      earliest_bracketing_date: row.earliestBracketing || null,
      earliest_installation_date: row.earliestInstallation || null,
      occupancy_date: row.occupancyDate || null,
      room_count: 0,
      window_count: 0,
      photos_uploaded: 0,
      notes_count: 0,
    });

    if (error) {
      errors.push(`${row.unitNumber}: ${error.message}`);
      continue;
    }

    await supabase.from("schedule_entries").insert({
      id: `sch-${crypto.randomUUID().slice(0, 8)}`,
      unit_id: unitId,
      unit_number: row.unitNumber.trim(),
      building_name: building?.name ?? "",
      client_name: client?.name ?? "",
      owner_user_id: owner.id,
      owner_name: owner.displayName,
      task_type: "bracketing",
      task_date: row.earliestBracketing || "9999-12-31",
      status: "pending_scheduling",
      risk_flag: "green",
    });

    created++;
    existingNumbers.add(row.unitNumber.trim());
  }

  revalidateApp();
  return { created, skipped, errors };
}
