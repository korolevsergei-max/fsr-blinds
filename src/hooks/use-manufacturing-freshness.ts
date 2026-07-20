"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Factory-portal freshness (MF2). The cutter/assembler/qc bench screens have no
 * other update path — an idle tablet left on the queue would otherwise never see
 * an upstream stage handoff (a cut appearing in the assembler queue, an approval
 * clearing the QC queue). Subscribe to production-status and schedule changes and
 * feed every event into the caller's coalesced refresh, so a burst of events
 * (including this client's own mutation echoes and a reflow's many schedule-row
 * writes) reconciles with ONE refetch — never a per-event storm.
 *
 * Scope: facility-wide and unfiltered. That is correct here — the Phase 2 RLS
 * policies already let factory roles read all production rows, and measured event
 * volume is low (~10 mutations/hr). It never bypasses RLS: the browser client
 * subscribes as the authenticated user.
 *
 * Reconnect/backfill: postgres_changes are NOT replayed after a dropped socket
 * (screen lock, in-building connectivity blips), so also refresh on every
 * re-subscribe after the first and whenever the tab regains visibility.
 *
 * `scheduleRefresh` should be a stable coalesced refresher (useCoalescedRefresh)
 * shared with the screen's own mutations so both feed one timer.
 */
export function useManufacturingFreshness(scheduleRefresh: () => void) {
  useEffect(() => {
    const supabase = createClient();
    // Unique per mount so a remount (StrictMode, fast route switches between the
    // factory screens) never collides with a not-yet-removed channel of the same name.
    const channel = supabase.channel(
      `manufacturing-freshness-${Math.random().toString(36).slice(2)}`
    );

    const onChange = () => scheduleRefresh();

    // `postgres_changes` is typed narrowly in the SDK; the app's realtime layer
    // uses the same cast (see use-realtime-sync.ts).
    const bind = (table: string) =>
      channel.on(
        "postgres_changes" as "system",
        { event: "*", schema: "public", table } as unknown as { event: "system" },
        onChange as unknown as (payload: { [key: string]: unknown }) => void
      );

    bind("window_production_status");
    bind("window_manufacturing_schedule");

    let hasSubscribed = false;
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (hasSubscribed) scheduleRefresh();
        hasSubscribed = true;
      }
    });

    const onVisibility = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      supabase.removeChannel(channel);
    };
  }, [scheduleRefresh]);
}
