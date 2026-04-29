"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { refreshDataset } from "@/app/actions/dataset-queries";
import type { AppDataset } from "./app-dataset";
import {
  mapClient,
  mapBuilding,
  mapInstaller,
  mapUnit,
  mapRoom,
  mapWindow,
  mapSchedule,
  mapCutter,
  mapScheduler,
  normalizeScheduleEntries,
  type ClientRow,
  type BuildingRow,
  type InstallerRow,
  type UnitRow,
  type RoomRow,
  type WindowRow,
  type ScheduleRow,
  type CutterRow,
  type SchedulerRow,
} from "./dataset-mappers";
import type { RealtimeChannel } from "@supabase/supabase-js";

type PatchFn = (updater: (prev: AppDataset) => AppDataset) => void;
type SetDataFn = (next: AppDataset) => void;
type LoaderKind = "full" | "scheduler" | "installer";

type PgPayload<T = Record<string, unknown>> = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: T;
  old: Partial<T> & { id?: string };
};

type SchedulerAssignmentRow = {
  unit_id: string;
  scheduler_id: string;
};

function upsert<T extends { id: string }>(arr: T[], item: T): T[] {
  const idx = arr.findIndex((x) => x.id === item.id);
  if (idx >= 0) {
    const next = [...arr];
    next[idx] = item;
    return next;
  }
  return [...arr, item];
}

function remove<T extends { id: string }>(arr: T[], id: string): T[] {
  return arr.filter((x) => x.id !== id);
}

function getSchedulerLabels(prev: AppDataset, schedulerId: string) {
  const schedulerName =
    prev.schedulers.find((scheduler) => scheduler.id === schedulerId)?.name ??
    prev.installers
      .find((installer) => installer.id === `sch-${schedulerId}`)
      ?.name?.replace(/^SC:\s*/, "") ??
    null;

  return {
    schedulerName,
    installerName: schedulerName ? `SC: ${schedulerName}` : null,
  };
}

function applySchedulerAssignment(
  prev: AppDataset,
  unitId: string | undefined,
  schedulerId: string | null
): AppDataset {
  if (!unitId) return prev;

  let changed = false;
  const labels = schedulerId ? getSchedulerLabels(prev, schedulerId) : null;

  const units = prev.units.map((unit) => {
    if (unit.id !== unitId) return unit;

    changed = true;

    return {
      ...unit,
      assignedSchedulerId: schedulerId,
      assignedSchedulerName: labels?.schedulerName ?? null,
      assignedInstallerId: schedulerId
        ? `sch-${schedulerId}`
        : unit.assignedInstallerId?.startsWith("sch-")
          ? null
          : unit.assignedInstallerId,
      assignedInstallerName: schedulerId
        ? labels?.installerName ?? unit.assignedInstallerName
        : unit.assignedInstallerId?.startsWith("sch-")
          ? null
          : unit.assignedInstallerName,
    };
  });

  return changed ? { ...prev, units } : prev;
}

export function useRealtimeSync(
  patchData: PatchFn,
  setData: SetDataFn,
  loaderKind: LoaderKind
) {
  const patchRef = useRef(patchData);
  const setDataRef = useRef(setData);
  useEffect(() => {
    patchRef.current = patchData;
    setDataRef.current = setData;
  });

  useEffect(() => {
    const supabase = createClient();
    const channels: RealtimeChannel[] = [];
    const shouldTrackMetaTables = loaderKind !== "installer";
    const shouldTrackStaffLists = loaderKind === "full" || loaderKind === "scheduler";
    const shouldTrackManufacturingLists = loaderKind === "full";
    let schedulerRefreshTimer: number | null = null;
    let datasetRefreshTimer: number | null = null;

    function scheduleScopedRefresh() {
      if (loaderKind !== "scheduler") return;
      if (schedulerRefreshTimer !== null) {
        window.clearTimeout(schedulerRefreshTimer);
      }
      schedulerRefreshTimer = window.setTimeout(() => {
        schedulerRefreshTimer = null;
        refreshDataset("scheduler").then((freshData) => {
          if (freshData) {
            setDataRef.current(freshData);
          }
        });
      }, 120);
    }

    function scheduleDatasetRefresh() {
      if (datasetRefreshTimer !== null) {
        window.clearTimeout(datasetRefreshTimer);
      }
      datasetRefreshTimer = window.setTimeout(() => {
        datasetRefreshTimer = null;
        refreshDataset(loaderKind).then((freshData) => {
          if (freshData) {
            setDataRef.current(freshData);
          }
        });
      }, 120);
    }

    function sub<Row>(
      table: string,
      handler: (payload: PgPayload<Row>) => void
    ) {
      const ch = supabase
        .channel(`realtime-${table}`)
        .on(
          "postgres_changes" as "system",
          { event: "*", schema: "public", table } as unknown as { event: "system" },
          handler as unknown as (payload: { [key: string]: unknown }) => void
        )
        .subscribe();
      channels.push(ch);
    }

    if (shouldTrackMetaTables) {
      sub<ClientRow>("clients", (p) => {
        patchRef.current((prev) => {
          const id = p.old.id;
          if (p.eventType === "DELETE" && id) {
            return { ...prev, clients: remove(prev.clients, id) };
          }
          return { ...prev, clients: upsert(prev.clients, mapClient(p.new as ClientRow)) };
        });
      });

      sub<BuildingRow>("buildings", (p) => {
        patchRef.current((prev) => {
          const id = p.old.id;
          if (p.eventType === "DELETE" && id) {
            return { ...prev, buildings: remove(prev.buildings, id) };
          }
          return { ...prev, buildings: upsert(prev.buildings, mapBuilding(p.new as BuildingRow)) };
        });
      });
    }

    sub<UnitRow>("units", (p) => {
      patchRef.current((prev) => {
        const id = p.old.id;
        if (p.eventType === "DELETE" && id) {
          const units = remove(prev.units, id);
          return { ...prev, units, schedule: normalizeScheduleEntries(units, prev.schedule) };
        }
        const units = upsert(prev.units, mapUnit(p.new as UnitRow));
        return { ...prev, units, schedule: normalizeScheduleEntries(units, prev.schedule) };
      });
    });

    sub<RoomRow>("rooms", (p) => {
      patchRef.current((prev) => {
        const id = p.old.id;
        if (p.eventType === "DELETE" && id) return { ...prev, rooms: remove(prev.rooms, id) };
        return { ...prev, rooms: upsert(prev.rooms, mapRoom(p.new as RoomRow)) };
      });
    });

    sub<WindowRow>("windows", (p) => {
      patchRef.current((prev) => {
        const id = p.old.id;
        if (p.eventType === "DELETE" && id) return { ...prev, windows: remove(prev.windows, id) };
        return { ...prev, windows: upsert(prev.windows, mapWindow(p.new as WindowRow)) };
      });
    });

    if (shouldTrackStaffLists) {
      sub<InstallerRow>("installers", (p) => {
        patchRef.current((prev) => {
          const id = p.old.id;
          if (p.eventType === "DELETE" && id) {
            return { ...prev, installers: remove(prev.installers, id) };
          }
          return { ...prev, installers: upsert(prev.installers, mapInstaller(p.new as InstallerRow)) };
        });
        scheduleScopedRefresh();
      });
    }

    sub<ScheduleRow>("schedule_entries", (p) => {
      patchRef.current((prev) => {
        const id = p.old.id;
        if (p.eventType === "DELETE" && id) {
          const schedule = remove(prev.schedule, id);
          return { ...prev, schedule };
        }
        const entry = mapSchedule(p.new as ScheduleRow);
        return { ...prev, schedule: upsert(prev.schedule, entry) };
      });
    });

    sub("window_post_install_issues", () => {
      scheduleDatasetRefresh();
    });

    sub("window_post_install_issue_notes", () => {
      scheduleDatasetRefresh();
    });

    if (shouldTrackManufacturingLists) {
      sub<CutterRow>("cutters", (p) => {
        patchRef.current((prev) => {
          const id = p.old.id;
          if (p.eventType === "DELETE" && id) {
            return { ...prev, cutters: remove(prev.cutters, id) };
          }
          return { ...prev, cutters: upsert(prev.cutters, mapCutter(p.new as CutterRow)) };
        });
      });
    }

    if (shouldTrackStaffLists) {
      sub<SchedulerRow>("schedulers", (p) => {
        patchRef.current((prev) => {
          const id = p.old.id;
          if (p.eventType === "DELETE" && id) {
            return { ...prev, schedulers: remove(prev.schedulers, id) };
          }
          return { ...prev, schedulers: upsert(prev.schedulers, mapScheduler(p.new as SchedulerRow)) };
        });
      });

      sub<SchedulerAssignmentRow>("scheduler_unit_assignments", (p) => {
        patchRef.current((prev) => {
          if (p.eventType === "DELETE") {
            return applySchedulerAssignment(prev, p.old.unit_id, null);
          }
          return applySchedulerAssignment(
            prev,
            (p.new as SchedulerAssignmentRow).unit_id,
            (p.new as SchedulerAssignmentRow).scheduler_id
          );
        });
        scheduleScopedRefresh();
      });
    }

    // Re-fetch full dataset when tab returns to foreground after being hidden > 60s
    let hiddenAt = 0;
    function onVisibility() {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > 60_000) {
        // Channels may have missed events while hidden.
        // The parent shell handles refresh via its own visibility listener.
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (schedulerRefreshTimer !== null) {
        window.clearTimeout(schedulerRefreshTimer);
      }
      if (datasetRefreshTimer !== null) {
        window.clearTimeout(datasetRefreshTimer);
      }
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [loaderKind]);
}
