"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
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

type PgPayload<T = Record<string, unknown>> = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: T;
  old: { id: string };
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

export function useRealtimeSync(patchData: PatchFn) {
  const patchRef = useRef(patchData);
  useEffect(() => {
    patchRef.current = patchData;
  });

  useEffect(() => {
    const supabase = createClient();
    const channels: RealtimeChannel[] = [];

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

    sub<ClientRow>("clients", (p) => {
      patchRef.current((prev) => {
        if (p.eventType === "DELETE") return { ...prev, clients: remove(prev.clients, p.old.id) };
        return { ...prev, clients: upsert(prev.clients, mapClient(p.new as ClientRow)) };
      });
    });

    sub<BuildingRow>("buildings", (p) => {
      patchRef.current((prev) => {
        if (p.eventType === "DELETE") return { ...prev, buildings: remove(prev.buildings, p.old.id) };
        return { ...prev, buildings: upsert(prev.buildings, mapBuilding(p.new as BuildingRow)) };
      });
    });

    sub<UnitRow>("units", (p) => {
      patchRef.current((prev) => {
        if (p.eventType === "DELETE") {
          const units = remove(prev.units, p.old.id);
          return { ...prev, units, schedule: normalizeScheduleEntries(units, prev.schedule) };
        }
        const units = upsert(prev.units, mapUnit(p.new as UnitRow));
        return { ...prev, units, schedule: normalizeScheduleEntries(units, prev.schedule) };
      });
    });

    sub<RoomRow>("rooms", (p) => {
      patchRef.current((prev) => {
        if (p.eventType === "DELETE") return { ...prev, rooms: remove(prev.rooms, p.old.id) };
        return { ...prev, rooms: upsert(prev.rooms, mapRoom(p.new as RoomRow)) };
      });
    });

    sub<WindowRow>("windows", (p) => {
      patchRef.current((prev) => {
        if (p.eventType === "DELETE") return { ...prev, windows: remove(prev.windows, p.old.id) };
        return { ...prev, windows: upsert(prev.windows, mapWindow(p.new as WindowRow)) };
      });
    });

    sub<InstallerRow>("installers", (p) => {
      patchRef.current((prev) => {
        if (p.eventType === "DELETE") return { ...prev, installers: remove(prev.installers, p.old.id) };
        return { ...prev, installers: upsert(prev.installers, mapInstaller(p.new as InstallerRow)) };
      });
    });

    sub<ScheduleRow>("schedule_entries", (p) => {
      patchRef.current((prev) => {
        if (p.eventType === "DELETE") {
          const schedule = remove(prev.schedule, p.old.id);
          return { ...prev, schedule };
        }
        const entry = mapSchedule(p.new as ScheduleRow);
        return { ...prev, schedule: upsert(prev.schedule, entry) };
      });
    });

    sub<CutterRow>("cutters", (p) => {
      patchRef.current((prev) => {
        if (p.eventType === "DELETE") return { ...prev, cutters: remove(prev.cutters, p.old.id) };
        return { ...prev, cutters: upsert(prev.cutters, mapCutter(p.new as CutterRow)) };
      });
    });

    sub<SchedulerRow>("schedulers", (p) => {
      patchRef.current((prev) => {
        if (p.eventType === "DELETE") return { ...prev, schedulers: remove(prev.schedulers, p.old.id) };
        return { ...prev, schedulers: upsert(prev.schedulers, mapScheduler(p.new as SchedulerRow)) };
      });
    });

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
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, []);
}
