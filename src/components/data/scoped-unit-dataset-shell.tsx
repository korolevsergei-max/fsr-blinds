"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AppDatasetProvider, useDatasetActions, useRegisterDatasetRefresh } from "@/lib/dataset-context";
import { createClient } from "@/lib/supabase/client";
import { refreshUnitDetail } from "@/app/actions/dataset-queries";
import type { AppDataset } from "@/lib/app-dataset";
import type { AppUser } from "@/lib/auth";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Scoped dataset shell for the management unit-detail subtree (DATA_SCOPING_PLAN Phase 1).
 *
 * Mounts a NESTED `AppDatasetProvider` seeded with a single unit's scope (from `loadUnitDetail`).
 * Because consumers read the nearest provider (`useDatasetSelector` / `useAppDatasetMaybe`), the
 * detail/edit/assign components see ~1 unit instead of the whole DB with zero component changes,
 * shadowing the global (full) provider in the management layout.
 *
 * Deliberately NOT a reuse of `AppDatasetClientShell`: that shell's `useRealtimeSync` blindly
 * `upsert()`s out-of-scope rows (which would pollute this scope) and persists to IndexedDB. Here
 * we use the scheduler-path model instead — a scoped debounced refetch — and skip IDB on scoped
 * routes (plan default). The shared `useRealtimeSync` is left untouched (C5 owns the realtime rework).
 */
export function ScopedUnitDatasetShell({
  unitId,
  initialData,
  user,
  children,
  refreshAction = refreshUnitDetail,
}: {
  unitId: string;
  initialData: AppDataset;
  user: AppUser;
  children: ReactNode;
  /**
   * Scoped refetch used by the realtime bridge. Defaults to the owner-gated `refreshUnitDetail`;
   * the scheduler subtree passes `refreshSchedulerUnitDetail` so a realtime refresh re-applies the
   * scheduler scope + team installer pick-list instead of returning `null` (owner-only).
   */
  refreshAction?: (unitId: string) => Promise<AppDataset | null>;
}) {
  return (
    <AppDatasetProvider initialData={initialData} user={user} linkedEntityId={unitId}>
      <ScopedUnitRealtimeBridge unitId={unitId} refreshAction={refreshAction} />
      {children}
    </AppDatasetProvider>
  );
}

/**
 * Keeps the scoped store live without polluting its scope: on any relevant Postgres change it
 * debounces a `refreshUnitDetail(unitId)` and replaces the store with authoritative server data,
 * rather than patching a global array. Channel filters cut event volume where the table carries
 * `unit_id`; `windows` has no `unit_id` (only `room_id`) so it subscribes unfiltered — the refetch
 * is one unit (cheap). C5 will consolidate/optimize channels.
 */
function ScopedUnitRealtimeBridge({
  unitId,
  refreshAction,
}: {
  unitId: string;
  refreshAction: (unitId: string) => Promise<AppDataset | null>;
}) {
  const { setData } = useDatasetActions();
  const setDataRef = useRef(setData);
  const refreshRef = useRef(refreshAction);
  useEffect(() => {
    setDataRef.current = setData;
    refreshRef.current = refreshAction;
  });

  // Back the shared refresh() (RefreshButton) with a single-unit refetch scoped to this provider.
  useRegisterDatasetRefresh(async () => {
    const fresh = await refreshRef.current(unitId);
    if (fresh) setDataRef.current(fresh);
  });

  useEffect(() => {
    const supabase = createClient();
    const channels: RealtimeChannel[] = [];
    let refreshTimer: number | null = null;

    function scheduleRefresh() {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        refreshRef.current(unitId).then((fresh) => {
          if (fresh) setDataRef.current(fresh);
        });
      }, 120);
    }

    function sub(table: string, filter?: string) {
      const config = filter
        ? { event: "*", schema: "public", table, filter }
        : { event: "*", schema: "public", table };
      // On every re-subscribe after the first, the socket dropped and may have missed events
      // (postgres_changes are not replayed), so refetch this unit to backfill.
      let hasSubscribed = false;
      const ch = supabase
        .channel(`scoped-unit-${unitId}-${table}`)
        .on(
          "postgres_changes" as "system",
          config as unknown as { event: "system" },
          (() => scheduleRefresh()) as unknown as (payload: { [key: string]: unknown }) => void
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            if (hasSubscribed) scheduleRefresh();
            hasSubscribed = true;
          }
        });
      channels.push(ch);
    }

    sub("units", `id=eq.${unitId}`);
    sub("rooms", `unit_id=eq.${unitId}`);
    sub("window_post_install_issues", `unit_id=eq.${unitId}`);
    sub("scheduler_unit_assignments", `unit_id=eq.${unitId}`);
    // windows carry only room_id, not unit_id → unfiltered; the scoped refetch is one unit.
    sub("windows");

    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [unitId]);

  return null;
}
