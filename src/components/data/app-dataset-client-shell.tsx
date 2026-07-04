"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  AppDatasetProvider,
  useDatasetSelector,
  useDatasetActions,
  useRegisterDatasetRefresh,
} from "@/lib/dataset-context";
import { useRealtimeSync } from "@/lib/use-realtime-sync";
import { getCachedData, setCachedData } from "@/lib/offline-cache";
import type { AppDataset } from "@/lib/app-dataset";
import type { AppUser } from "@/lib/auth";
import { refreshDataset } from "@/app/actions/dataset-queries";

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
      {children}
    </AppDatasetProvider>
  );
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
  const canUseOfflineCache = loaderKind !== "full";

  // Wire up Supabase Realtime subscriptions
  useRealtimeSync(patchData, setData, loaderKind);

  // Back the shared refresh() (used by RefreshButton) with a full portal refetch. Without this the
  // manual Refresh button only re-runs RSC and never re-seeds the client store the lists read from.
  useRegisterDatasetRefresh(async () => {
    const fresh = await refreshDataset(loaderKind);
    if (fresh) setData(fresh);
  });

  // On mount: seed from IDB if server provided empty data (offline / first-render fallback).
  useEffect(() => {
    if (!canUseOfflineCache) return;
    if (data.units.length === 0 && data.clients.length === 0) {
      getCachedData<typeof data>(cacheKey).then((cached) => {
        if (cached) setData(cached);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, canUseOfflineCache]);

  // Persist dataset to IDB whenever it changes, but debounce bursts of realtime patches.
  useEffect(() => {
    if (!canUseOfflineCache) return;
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
  }, [cacheKey, data, canUseOfflineCache]);

  useEffect(() => {
    if (!eagerRefreshOnMount || eagerRefreshStartedRef.current) return;
    eagerRefreshStartedRef.current = true;

    refreshDataset(loaderKind).then((freshData) => {
      if (freshData) setData(freshData);
    });
  }, [eagerRefreshOnMount, loaderKind, setData]);

  // Refresh when the tab returns to the foreground. Field users routinely leave to
  // measure/bracket and come back; the realtime socket may have been suspended and missed events
  // (postgres_changes are not replayed), so pull authoritative data on return. Throttled so rapid
  // tab/app switches don't cause a refetch storm.
  const setDataRef = useRef(setData);
  const hiddenAtRef = useRef(0);
  const lastForegroundRefreshRef = useRef(0);
  useEffect(() => {
    setDataRef.current = setData;
  });

  useEffect(() => {
    function refreshForeground() {
      const now = Date.now();
      if (now - lastForegroundRefreshRef.current < 3_000) return;
      lastForegroundRefreshRef.current = now;
      refreshDataset(loaderKind).then((freshData) => {
        if (freshData) setDataRef.current(freshData);
      });
    }
    function onVisibility() {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else if (hiddenAtRef.current && Date.now() - hiddenAtRef.current > 3_000) {
        refreshForeground();
      }
    }
    window.addEventListener("focus", refreshForeground);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refreshForeground);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loaderKind]);

  return null;
}
