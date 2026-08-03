"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Returns a `scheduleRefresh` that coalesces a burst of calls into a SINGLE
 * trailing-edge `router.refresh()`. Each call resets the timer, so N rapid
 * mutations (mark-cut, pushback, undo — or, later, a burst of realtime events)
 * reconcile with one server refetch after the burst settles, instead of one
 * refetch per action. (B1 / roadmap Phase 2; MF2 feeds this from realtime.)
 *
 * The pending timer is cleared on unmount so a refresh can never fire against a
 * torn-down route.
 */
export function useCoalescedRefresh(delayMs = 1500, maxWaitMs = 5000) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstCallAtRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return useCallback(() => {
    const now = Date.now();
    if (firstCallAtRef.current === null) firstCallAtRef.current = now;

    const fire = () => {
      timerRef.current = null;
      firstCallAtRef.current = null;
      router.refresh();
    };

    // Pure trailing debounce starves under a sustained burst: a facility reflow
    // rewrites ~2,000 window_manufacturing_schedule rows, and every resulting
    // realtime event resets the timer, so the tablet can sit stale for the whole
    // write. Cap the total wait — the refresh still coalesces, it just can't be
    // deferred indefinitely.
    const waitedFor = now - firstCallAtRef.current;
    const remaining = Math.max(0, maxWaitMs - waitedFor);
    if (remaining === 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      fire();
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fire, Math.min(delayMs, remaining));
  }, [router, delayMs, maxWaitMs]);
}
