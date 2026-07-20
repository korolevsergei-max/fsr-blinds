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
export function useCoalescedRefresh(delayMs = 1500) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      router.refresh();
    }, delayMs);
  }, [router, delayMs]);
}
