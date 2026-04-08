"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AppDatasetProvider, useAppDataset } from "@/lib/dataset-context";
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
  children,
}: {
  initialData: AppDataset;
  user: AppUser;
  /** Linked entity ID for the portal (e.g. installerId). */
  linkedEntityId?: string | null;
  /** Which server action to call for full refresh. Defaults to refreshDataset (full). */
  portalDataLoader?: "full" | "scheduler" | "installer";
  children: ReactNode;
}) {
  const loaderKind = portalDataLoader ?? "full";

  return (
    <AppDatasetProvider initialData={initialData} user={user} linkedEntityId={linkedEntityId}>
      <RealtimeBridge loaderKind={loaderKind} />
      {children}
    </AppDatasetProvider>
  );
}

/** Hooks into the dataset context to wire up Realtime, visibility refresh, and IDB persistence. */
function RealtimeBridge({ loaderKind }: { loaderKind: "full" | "scheduler" | "installer" }) {
  const { data, patchData, setData } = useAppDataset();

  // Wire up Supabase Realtime subscriptions
  useRealtimeSync(patchData);

  // On mount: seed from IDB if server provided empty data (offline / first-render fallback).
  useEffect(() => {
    if (data.units.length === 0 && data.clients.length === 0) {
      getCachedData<typeof data>(DATASET_CACHE_KEY).then((cached) => {
        if (cached) setData(cached);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist dataset to IDB whenever it changes (debounced via ref)
  useEffect(() => {
    setCachedData(DATASET_CACHE_KEY, data);
  }, [data]);

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
