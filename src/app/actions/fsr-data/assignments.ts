"use server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwnerOrScheduler, getLinkedSchedulerId } from "@/lib/auth";
import { getSchedulerScopedUnitIds } from "@/lib/scheduler-scope";
import { emitNotification } from "@/lib/emit-notification";
import { buildUnitAssignedNotificationBody, buildUnitDatesNotificationBody } from "@/lib/notification-copy";
import { NOTIF_UNIT_ASSIGNED_TO_INSTALLER, NOTIF_INSTALLATION_DATE_SET, NOTIF_DATES_CHANGED } from "@/lib/notification-types";
import { revalidateManyUnitRoutes, revalidateUnitRoutes } from "@/app/actions/revalidation";
import { type ActionResult, assertSchedulerUnitScope, loadUnitNotificationContext, resolveInstallerName, syncCoordinatorAssignmentForInstaller, logUnitActivity } from "./_shared";

export async function bulkAssignUnits(
  unitIds: string[],
  installerId: string,
  bracketingDate: string,
  installationDate: string,
  priority?: string,
  measurementDate?: string,
  completeByDate?: string
): Promise<ActionResult> {
  if (unitIds.length === 0) return { ok: false, error: "No units selected" };
  try {
    const owner = await requireOwnerOrScheduler();
    const supabase = await createClient();

    // For schedulers: same scope as loadSchedulerDataset (assignments + units on team installers).
    let scopedUnitIds = unitIds;
    if (owner.role === "scheduler") {
      const schedulerId = await getLinkedSchedulerId(owner.id);
      if (!schedulerId) return { ok: false, error: "Scheduler account not found." };

      const allowedUnitIds = new Set(await getSchedulerScopedUnitIds(supabase, schedulerId));
      scopedUnitIds = unitIds.filter((id) => allowedUnitIds.has(id));

      if (scopedUnitIds.length === 0) {
        return { ok: false, error: "None of the selected units are assigned to you." };
      }
    }

    let instName = "Assignee";
    const patch: Record<string, unknown> = {};

    if (installerId) {
      const installerName = await resolveInstallerName(supabase, installerId);
      if (!installerName) {
        return {
          ok: false,
          error: "Selected installer no longer exists. Re-open the sheet and choose a valid installer.",
        };
      }
      instName = installerName;

      if (installerId.startsWith("sch-")) {
        const schedulerId = installerId.replace("sch-", "");

        // Ensure the units are assigned to this scheduler for management access
        const assignments = scopedUnitIds.map((uid) => ({
          id: `sua-${uid}`,
          unit_id: uid,
          scheduler_id: schedulerId,
          assigned_at: new Date().toISOString(),
        }));

        const { error: assError } = await supabase
          .from("scheduler_unit_assignments")
          .upsert(assignments, { onConflict: "unit_id" });

        if (assError) return { ok: false, error: assError.message };
        patch.assigned_installer_name = null;
        patch.assigned_installer_id = null;
      } else {
        patch.assigned_installer_name = instName;
        patch.assigned_installer_id = installerId;
        const coordErr = await syncCoordinatorAssignmentForInstaller(
          supabase,
          scopedUnitIds,
          installerId
        );
        if (coordErr) return coordErr;
      }
    }

    if (bracketingDate) {
      patch.bracketing_date = bracketingDate;
    }
    if (installationDate) patch.installation_date = installationDate;
    if (measurementDate) patch.measurement_date = measurementDate;
    if (completeByDate && owner.role === "owner") patch.complete_by_date = completeByDate;
    if (priority) {
      patch.risk_flag = priority === "clear" ? null : priority;
    }

    const { error } = await supabase.from("units").update(patch).in("id", scopedUnitIds);
    if (error) return { ok: false, error: error.message };

    const { data: unitRows } = await supabase
      .from("units")
      .select("id, unit_number, building_name, client_name, status")
      .in("id", scopedUnitIds);

    for (const unit of unitRows ?? []) {
      if (measurementDate) {
        const { data: existingMeasurement } = await supabase
          .from("schedule_entries")
          .select("id")
          .eq("unit_id", unit.id)
          .eq("task_type", "measurement")
          .single();

        if (existingMeasurement) {
          await supabase
            .from("schedule_entries")
            .update({
              task_date: measurementDate,
              status: unit.status,
              owner_user_id: owner.id,
              owner_name: owner.displayName,
            })
            .eq("id", existingMeasurement.id);
        } else {
          await supabase.from("schedule_entries").insert({
            id: `sch-${crypto.randomUUID().slice(0, 8)}`,
            unit_id: unit.id,
            unit_number: unit.unit_number,
            building_name: unit.building_name,
            client_name: unit.client_name,
            owner_user_id: owner.id,
            owner_name: owner.displayName,
            task_type: "measurement",
            task_date: measurementDate,
            status: unit.status,
            risk_flag: "green",
          });
        }
      }

      if (bracketingDate) {
        const { data: existingBracketing } = await supabase
          .from("schedule_entries")
          .select("id")
          .eq("unit_id", unit.id)
          .eq("task_type", "bracketing")
          .single();

        if (existingBracketing) {
          await supabase
            .from("schedule_entries")
            .update({
              task_date: bracketingDate,
              status: unit.status,
              owner_user_id: owner.id,
              owner_name: owner.displayName,
            })
            .eq("id", existingBracketing.id);
        } else {
          await supabase.from("schedule_entries").insert({
            id: `sch-${crypto.randomUUID().slice(0, 8)}`,
            unit_id: unit.id,
            unit_number: unit.unit_number,
            building_name: unit.building_name,
            client_name: unit.client_name,
            owner_user_id: owner.id,
            owner_name: owner.displayName,
            task_type: "bracketing",
            task_date: bracketingDate,
            status: unit.status,
            risk_flag: "green",
          });
        }
      }

      if (installationDate) {
        const { data: existingInstallation } = await supabase
          .from("schedule_entries")
          .select("id")
          .eq("unit_id", unit.id)
          .eq("task_type", "installation")
          .single();

        if (existingInstallation) {
          await supabase
            .from("schedule_entries")
            .update({
              task_date: installationDate,
              status: unit.status,
              owner_user_id: owner.id,
              owner_name: owner.displayName,
            })
            .eq("id", existingInstallation.id);
        } else {
          await supabase.from("schedule_entries").insert({
            id: `sch-${crypto.randomUUID().slice(0, 8)}`,
            unit_id: unit.id,
            unit_number: unit.unit_number,
            building_name: unit.building_name,
            client_name: unit.client_name,
            owner_user_id: owner.id,
            owner_name: owner.displayName,
            task_type: "installation",
            task_date: installationDate,
            status: unit.status,
            risk_flag: "green",
          });
        }
      }
    }

    await Promise.all(
      unitIds.map((unitId) =>
        logUnitActivity(supabase, unitId, owner.role, owner.displayName, "bulk_assigned", {
          ...(installerId ? { installer: instName } : {}),
          ...(measurementDate ? { measurementDate } : {}),
          ...(bracketingDate ? { bracketingDate } : {}),
          ...(installationDate ? { installationDate } : {}),
          ...(completeByDate ? { completeByDate } : {}),
          unitCount: unitIds.length,
        })
      )
    );

    // ─── Notifications ────────────────────────────────────────────────────────
    after(async () => {
      const db = createAdminClient();
      // Notify the real installer (not a scheduler acting as installer)
      if (installerId && !installerId.startsWith("sch-")) {
        const { data: insRow } = await db
          .from("installers")
          .select("id")
          .eq("id", installerId)
          .maybeSingle();
        if (insRow) {
          for (const uid of scopedUnitIds) {
            const context = await loadUnitNotificationContext(db, uid);
            await emitNotification({
              recipientRole: "installer",
              recipientId: installerId,
              type: NOTIF_UNIT_ASSIGNED_TO_INSTALLER,
              title: "Unit added to your queue",
              body: context
                ? buildUnitAssignedNotificationBody(context, owner.displayName)
                : `Assigned by ${owner.displayName}`,
              relatedUnitId: uid,
            });
          }
        }
      }

      // Notify about installation date being newly set (per unit, only if it's new)
      if (installationDate) {
        for (const uid of scopedUnitIds) {
          const { data: unitRow } = await db
            .from("units")
            .select("assigned_installer_id, installation_date")
            .eq("id", uid)
            .maybeSingle();
          if (unitRow?.assigned_installer_id && unitRow.installation_date === installationDate) {
            const context = await loadUnitNotificationContext(db, uid);
            await emitNotification({
              recipientRole: "installer",
              recipientId: unitRow.assigned_installer_id,
              type: NOTIF_INSTALLATION_DATE_SET,
              title: "Installation date set",
              body: context
                ? buildUnitDatesNotificationBody(context, { installationDate })
                : `Installation: ${installationDate}`,
              relatedUnitId: uid,
            });
          }
        }
      }
    });
    // ─────────────────────────────────────────────────────────────────────────

    revalidateManyUnitRoutes(
      scopedUnitIds.map((id) => ({ id }))
    );
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function updateUnitAssignment(
  unitId: string,
  installerId: string | undefined | null,
  measurementDate: string,
  bracketingDate: string,
  installationDate: string
): Promise<ActionResult> {
  try {
    const owner = await requireOwnerOrScheduler();
    const supabase = await createClient();

    const scopeErr = await assertSchedulerUnitScope(supabase, owner, unitId);
    if (scopeErr) return scopeErr;

    let unitMeta:
      | {
          unit_number: string;
          building_name: string;
          client_name: string;
          status: string;
        }
      | null
      | undefined;

    const ensureUnitMeta = async () => {
      if (unitMeta !== undefined) return unitMeta;
      const { data } = await supabase
        .from("units")
        .select("unit_number, building_name, client_name, status")
        .eq("id", unitId)
        .single();
      unitMeta = data ?? null;
      return unitMeta;
    };

    const patch: Record<string, unknown> = {
      measurement_date: measurementDate || null,
      bracketing_date: bracketingDate || null,
      installation_date: installationDate || null,
    };

    if (installerId) {
      const installerName = await resolveInstallerName(supabase, installerId);
      if (!installerName) {
        return {
          ok: false,
          error: "Selected installer no longer exists. Choose a valid installer and try again.",
        };
      }

      if (installerId.startsWith("sch-")) {
        const schedulerId = installerId.replace("sch-", "");

        const { error: assError } = await supabase
          .from("scheduler_unit_assignments")
          .upsert(
            {
              id: `sua-${unitId}`,
              unit_id: unitId,
              scheduler_id: schedulerId,
              assigned_at: new Date().toISOString(),
            },
            { onConflict: "unit_id" }
          );

        if (assError) return { ok: false, error: assError.message };
        patch.assigned_installer_name = null;
        patch.assigned_installer_id = null;
      } else {
        patch.assigned_installer_name = installerName;
        patch.assigned_installer_id = installerId;
        const coordErr = await syncCoordinatorAssignmentForInstaller(supabase, [unitId], installerId);
        if (coordErr) return coordErr;
      }
    }

    if (bracketingDate) {
      patch.bracketing_date = bracketingDate;
    }

    const { error } = await supabase
      .from("units")
      .update(patch)
      .eq("id", unitId);
    if (error) {
      return { ok: false, error: error.message };
    }

    // Upsert measurement schedule entry
    if (measurementDate) {
      const nextUnitMeta = await ensureUnitMeta();
      const { data: existingMeasurement } = await supabase
        .from("schedule_entries")
        .select("id")
        .eq("unit_id", unitId)
        .eq("task_type", "measurement")
        .single();

      if (existingMeasurement) {
        await supabase
          .from("schedule_entries")
          .update({
            task_date: measurementDate,
            status: nextUnitMeta?.status ?? "not_started",
            owner_user_id: owner.id,
            owner_name: owner.displayName,
          })
          .eq("id", existingMeasurement.id);
      } else {
        await supabase.from("schedule_entries").insert({
          id: `sch-${crypto.randomUUID().slice(0, 8)}`,
          unit_id: unitId,
          unit_number: nextUnitMeta?.unit_number ?? "",
          building_name: nextUnitMeta?.building_name ?? "",
          client_name: nextUnitMeta?.client_name ?? "",
          owner_user_id: owner.id,
          owner_name: owner.displayName,
          task_type: "measurement",
          task_date: measurementDate,
          status: nextUnitMeta?.status ?? "not_started",
          risk_flag: "green",
        });
      }
    } else {
      await supabase
        .from("schedule_entries")
        .delete()
        .eq("unit_id", unitId)
        .eq("task_type", "measurement");
    }

    if (bracketingDate) {
      const nextUnitMeta = await ensureUnitMeta();
      const { data: existingBracketing } = await supabase
        .from("schedule_entries")
        .select("id")
        .eq("unit_id", unitId)
        .eq("task_type", "bracketing")
        .single();

      if (existingBracketing) {
        await supabase
          .from("schedule_entries")
          .update({
            task_date: bracketingDate,
            status: nextUnitMeta?.status ?? "not_started",
            owner_user_id: owner.id,
            owner_name: owner.displayName,
          })
          .eq("id", existingBracketing.id);
      } else {
        await supabase.from("schedule_entries").insert({
          id: `sch-${crypto.randomUUID().slice(0, 8)}`,
          unit_id: unitId,
          unit_number: nextUnitMeta?.unit_number ?? "",
          building_name: nextUnitMeta?.building_name ?? "",
          client_name: nextUnitMeta?.client_name ?? "",
          owner_user_id: owner.id,
          owner_name: owner.displayName,
          task_type: "bracketing",
          task_date: bracketingDate,
          status: nextUnitMeta?.status ?? "not_started",
          risk_flag: "green",
        });
      }
    } else {
      await supabase
        .from("schedule_entries")
        .delete()
        .eq("unit_id", unitId)
        .eq("task_type", "bracketing");
    }
    if (installationDate) {
      const nextUnitMeta = await ensureUnitMeta();
      const { data: existingInstallation } = await supabase
        .from("schedule_entries")
        .select("id")
        .eq("unit_id", unitId)
        .eq("task_type", "installation")
        .single();

      if (existingInstallation) {
        await supabase
          .from("schedule_entries")
          .update({
            task_date: installationDate,
            status: nextUnitMeta?.status ?? "not_started",
            owner_user_id: owner.id,
            owner_name: owner.displayName,
          })
          .eq("id", existingInstallation.id);
      } else {
        await supabase.from("schedule_entries").insert({
          id: `sch-${crypto.randomUUID().slice(0, 8)}`,
          unit_id: unitId,
          unit_number: nextUnitMeta?.unit_number ?? "",
          building_name: nextUnitMeta?.building_name ?? "",
          client_name: nextUnitMeta?.client_name ?? "",
          owner_user_id: owner.id,
          owner_name: owner.displayName,
          task_type: "installation",
          task_date: installationDate,
          status: nextUnitMeta?.status ?? "not_started",
          risk_flag: "green",
        });
      }
    } else {
      await supabase
        .from("schedule_entries")
        .delete()
        .eq("unit_id", unitId)
        .eq("task_type", "installation");
    }

    await logUnitActivity(supabase, unitId, owner.role, owner.displayName, "installer_assigned", {
      ...(installerId && patch.assigned_installer_name ? { installer: patch.assigned_installer_name as string } : {}),
      ...(measurementDate ? { measurementDate } : {}),
      ...(bracketingDate ? { bracketingDate } : {}),
      ...(installationDate ? { installationDate } : {}),
    });

    // ─── Notifications ────────────────────────────────────────────────────────
    after(async () => {
      const resolvedInstallerId = installerId && !installerId.startsWith("sch-") ? installerId : null;
      const context = resolvedInstallerId
        ? await loadUnitNotificationContext(createAdminClient(), unitId)
        : null;

      // Notify installer of assignment (single unit)
      if (resolvedInstallerId && patch.assigned_installer_name) {
        await emitNotification({
          recipientRole: "installer",
          recipientId: resolvedInstallerId,
          type: NOTIF_UNIT_ASSIGNED_TO_INSTALLER,
          title: "Unit added to your queue",
          body: context
            ? buildUnitAssignedNotificationBody(context, owner.displayName)
            : `Assigned by ${owner.displayName}`,
          relatedUnitId: unitId,
        });
      }

      // Notify installer of date changes
      if (resolvedInstallerId && (measurementDate || bracketingDate || installationDate)) {
        const hadInstallDate = Boolean(installationDate);
        await emitNotification({
          recipientRole: "installer",
          recipientId: resolvedInstallerId,
          type: hadInstallDate ? NOTIF_INSTALLATION_DATE_SET : NOTIF_DATES_CHANGED,
          title: hadInstallDate ? "Installation date set" : "Schedule dates updated",
          body: context
            ? buildUnitDatesNotificationBody(context, {
                measurementDate,
                bracketingDate,
                installationDate,
              })
            : [
                measurementDate && `Measurement: ${measurementDate}`,
                bracketingDate && `Bracketing: ${bracketingDate}`,
                installationDate && `Installation: ${installationDate}`,
              ]
                .filter(Boolean)
                .join(" · "),
          relatedUnitId: unitId,
        });
      }
    });
    // ─────────────────────────────────────────────────────────────────────────

    revalidateUnitRoutes(unitId);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}
