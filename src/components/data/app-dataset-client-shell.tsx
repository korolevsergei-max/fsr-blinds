"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AppDatasetProvider, useDatasetSelector, useDatasetActions } from "@/lib/dataset-context";
import { useRealtimeSync } from "@/lib/use-realtime-sync";
import { getCachedData, setCachedData } from "@/lib/offline-cache";
import type { AppDataset } from "@/lib/app-dataset";
import type { AppUser } from "@/lib/auth";
import type { UnitStatus } from "@/lib/types";
import { refreshDataset } from "@/app/actions/dataset-queries";
import { subscribeToResolutions } from "@/lib/upload-queue";
import { removeUnitStageMediaItem } from "@/lib/use-unit-supplemental";
import { reconcileUnitDerivedState } from "@/lib/unit-status-helpers";

const DATASET_CACHE_KEY = "app-dataset";

/**
 * Client shell that wraps a portal's content with the shared dataset context.
 * Receives initial data from the server layout, then keeps it live via Realtime
 * and visibility-based refresh.
 */
export function AppDatasetClientShell({
  initialData,
  user,
  linkedEntityId,
  portalDataLoader,
  eagerRefreshOnMount = false,
  children,
}: {
  initialData: AppDataset;
  user: AppUser;
  /** Linked entity ID for the portal (e.g. installerId). */
  linkedEntityId?: string | null;
  /** Which server action to call for full refresh. Defaults to refreshDataset (full). */
  portalDataLoader?: "full" | "scheduler" | "installer";
  /** Trigger an immediate client-side refresh after mount. */
  eagerRefreshOnMount?: boolean;
  children: ReactNode;
}) {
  const loaderKind = portalDataLoader ?? "full";
  const cacheKey = `${DATASET_CACHE_KEY}:${loaderKind}:${linkedEntityId ?? user.id}`;

  return (
    <AppDatasetProvider initialData={initialData} user={user} linkedEntityId={linkedEntityId}>
      <RealtimeBridge
        loaderKind={loaderKind}
        cacheKey={cacheKey}
        eagerRefreshOnMount={eagerRefreshOnMount}
      />
      <UploadReconciler />
      {children}
    </AppDatasetProvider>
  );
}

/**
 * Bridges the background upload queue's terminal outcomes to this provider's dataset store.
 * On success it confirms the recorded unit status (idempotent with the realtime echo); on
 * permanent failure it rolls back the optimistic patch (reverts the flipped stage flag + photo
 * count) and drops the optimistic gallery item. Uses actions-only access so it never re-renders.
 */
function UploadReconciler() {
  const { patchData } = useDatasetActions();
  const patchRef = useRef(patchData);
  useEffect(() => {
    patchRef.current = patchData;
  });

  useEffect(() => {
    return subscribeToResolutions((resolution) => {
      const rec = resolution.item.reconcile;
      if (!rec) return;

      if (resolution.outcome === "success") {
        const status = resolution.result?.unitStatus;
        if (status) {
          patchRef.current((prev) =>
            reconcileUnitDerivedState(prev, rec.unitId, { unitStatus: status as UnitStatus })
          );
        }
        return;
      }

      // Permanent failure: undo the optimistic UI so we never show a photo that didn't persist.
      removeUnitStageMediaItem(rec.unitId, rec.tempMediaId);
      patchRef.current((prev) => {
        let next = prev;
        if (rec.prev.flippedBracketed || rec.prev.flippedInstalled) {
          next = {
            ...next,
            windows: next.windows.map((w) =>
              w.id === rec.windowId
                ? {
                    ...w,
                    ...(rec.prev.flippedBracketed ? { bracketed: false } : {}),
                    ...(rec.prev.flippedInstalled ? { installed: false } : {}),
                  }
                : w
            ),
          };
        }
        return reconcileUnitDerivedState(next, rec.unitId, {
          photoDelta: rec.prev.photoAdded ? -1 : 0,
        });
      });
    });
  }, []);

  return null;
}

/** Hooks into the dataset context to wire up Realtime, visibility refresh, and IDB persistence. */
function RealtimeBridge({
  loaderKind,
  cacheKey,
  eagerRefreshOnMount,
}: {
  loaderKind: "full" | "scheduler" | "installer";
  cacheKey: string;
  eagerRefreshOnMount: boolean;
}) {
  // RealtimeBridge must react to every data change (it persists the full dataset to IDB),
  // so it subscribes to the whole `data` slice intentionally.
  const data = useDatasetSelector((value) => value.data);
  const { patchData, setData } = useDatasetActions();
  const cacheWriteTimerRef = useRef<number | null>(null);
  const eagerRefreshStartedRef = useRef(false);

  // Wire up Supabase Realtime subscriptions
  useRealtimeSync(patchData, setData, loaderKind);

  // On mount: seed from IDB if server provided empty data (offline / first-render fallback,
  // or mobile cold-open where the layout defers the initial load — stale-while-revalidate).
  useEffect(() => {
    if (data.units.length === 0 && data.clients.length === 0) {
      getCachedData<typeof data>(cacheKey).then((cached) => {
        if (cached) setData(cached);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  // Persist dataset to IDB whenever it changes, but debounce bursts of realtime patches.
  useEffect(() => {
    if (cacheWriteTimerRef.current !== null) {
      window.clearTimeout(cacheWriteTimerRef.current);
    }

    cacheWriteTimerRef.current = window.setTimeout(() => {
      void setCachedData(cacheKey, data);
      cacheWriteTimerRef.current = null;
    }, 800);

    return () => {
      if (cacheWriteTimerRef.current !== null) {
        window.clearTimeout(cacheWriteTimerRef.current);
        cacheWriteTimerRef.current = null;
      }
    };
  }, [cacheKey, data]);

  useEffect(() => {
    if (!eagerRefreshOnMount || eagerRefreshStartedRef.current) return;
    eagerRefreshStartedRef.current = true;

    refreshDataset(loaderKind).then((freshData) => {
      if (freshData) setData(freshData);
    });
  }, [eagerRefreshOnMount, loaderKind, setData]);

  // Refresh when the tab returns from background after 60s+
  const setDataRef = useRef(setData);
  const hiddenAtRef = useRef(0);
  useEffect(() => {
    setDataRef.current = setData;
  });

  useEffect(() => {
    function onVisibility() {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else if (
        hiddenAtRef.current &&
        Date.now() - hiddenAtRef.current > 60_000
      ) {
        refreshDataset(loaderKind).then((freshData) => {
          if (freshData) setDataRef.current(freshData);
        });
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [loaderKind]);

  return null;
}
