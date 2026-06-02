"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/shim/with-selector";
import {
  createDatasetStore,
  type DatasetActions,
  type DatasetContextValue,
  type DatasetSnapshot,
  type DatasetStore,
} from "./dataset-store";
import type { AppDataset } from "./app-dataset";
import type { AppUser } from "./auth";

export type { DatasetContextValue, DatasetActions, DatasetSnapshot } from "./dataset-store";

const DatasetContext = createContext<DatasetStore | null>(null);
const EMPTY_SUBSCRIBE = () => () => {};

export function AppDatasetProvider({
  initialData,
  user,
  linkedEntityId = null,
  children,
}: {
  initialData: AppDataset;
  user: AppUser;
  linkedEntityId?: string | null;
  children: ReactNode;
}) {
  const [store] = useState<DatasetStore>(() =>
    createDatasetStore({
      data: initialData,
      user,
      linkedEntityId,
      isHydratingInitialData:
        initialData.clients.length === 0 &&
        initialData.buildings.length === 0 &&
        initialData.units.length === 0 &&
        initialData.rooms.length === 0 &&
        initialData.windows.length === 0 &&
        initialData.installers.length === 0 &&
        initialData.schedule.length === 0 &&
        initialData.cutters.length === 0 &&
        initialData.schedulers.length === 0 &&
        initialData.postInstallIssues.length === 0,
      lastUpdated: 0,
    })
  );

  useEffect(() => {
    store.syncMeta(user, linkedEntityId);
  }, [store, user, linkedEntityId]);

  return (
    <DatasetContext.Provider value={store}>{children}</DatasetContext.Provider>
  );
}

/** Builds the value passed to selectors: the data-only snapshot plus the store's stable actions. */
function toContextValue(snapshot: DatasetSnapshot, store: DatasetStore): DatasetContextValue {
  return { ...snapshot, patchData: store.patchData, setData: store.setData };
}

/**
 * Subscribe to a slice of the dataset with a TRUE per-slice bailout: the component re-renders
 * only when `equalityFn` reports the selected value changed. `useSyncExternalStoreWithSelector`
 * first compares the raw snapshot by reference (skipping the selector on unrelated renders), then
 * compares the selected value against the last committed value. Unchanged slices keep their
 * reference across patches, so e.g. a `windows`-only patch won't re-render a `clients` selector.
 */
export function useDatasetSelector<T>(
  selector: (value: DatasetContextValue) => T,
  equalityFn: (a: T, b: T) => boolean = Object.is
): T {
  const store = useContext(DatasetContext);
  if (!store) {
    throw new Error("useDatasetSelector must be used within an AppDatasetProvider");
  }
  return useSyncExternalStoreWithSelector(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
    (snapshot) => selector(toContextValue(snapshot, store)),
    equalityFn
  );
}

/** Optional — selects `null` instead of throwing when used outside the provider. */
export function useDatasetSelectorMaybe<T>(
  selector: (value: DatasetContextValue) => T,
  equalityFn: (a: T | null, b: T | null) => boolean = Object.is
): T | null {
  const store = useContext(DatasetContext);
  const getSnapshot = useMemo(
    () => () => (store ? store.getSnapshot() : null),
    [store]
  );
  return useSyncExternalStoreWithSelector<DatasetSnapshot | null, T | null>(
    store?.subscribe ?? EMPTY_SUBSCRIBE,
    getSnapshot,
    getSnapshot,
    (snapshot) =>
      store && snapshot ? selector(toContextValue(snapshot, store)) : null,
    equalityFn
  );
}

/**
 * Returns the store's stable action handlers WITHOUT subscribing to data changes — mutation-only
 * consumers never re-render on patches. Throws outside the provider.
 */
export function useDatasetActions(): DatasetActions {
  const store = useContext(DatasetContext);
  if (!store) {
    throw new Error("useDatasetActions must be used within an AppDatasetProvider");
  }
  return useMemo(
    () => ({ patchData: store.patchData, setData: store.setData }),
    [store]
  );
}

/** Optional — returns `null` instead of throwing when used outside the provider. */
export function useDatasetActionsMaybe(): DatasetActions | null {
  const store = useContext(DatasetContext);
  return useMemo(
    () => (store ? { patchData: store.patchData, setData: store.setData } : null),
    [store]
  );
}

/** One-level shallow equality for selectors that return a composed object/array of slices. */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return false;
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (
      !Object.prototype.hasOwnProperty.call(bRecord, key) ||
      !Object.is(aRecord[key], bRecord[key])
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Selects a `Pick` of the named dataset slices with a shallow-equality bailout: the component
 * re-renders only when one of the selected slice references changes. Ergonomic wrapper for the
 * common "forward a narrowed `data` object to a child" pattern.
 */
export function useDatasetSlices<K extends keyof AppDataset>(
  keys: readonly K[]
): Pick<AppDataset, K> {
  return useDatasetSelector((value) => {
    const out = {} as Pick<AppDataset, K>;
    for (const key of keys) {
      out[key] = value.data[key];
    }
    return out;
  }, shallowEqual);
}

/** Optional variant of {@link useDatasetSlices} — returns `null` when outside the provider. */
export function useDatasetSlicesMaybe<K extends keyof AppDataset>(
  keys: readonly K[]
): Pick<AppDataset, K> | null {
  return useDatasetSelectorMaybe((value) => {
    const out = {} as Pick<AppDataset, K>;
    for (const key of keys) {
      out[key] = value.data[key];
    }
    return out;
  }, shallowEqual);
}

/**
 * Back-compat: returns the whole dataset value. Re-renders on every patch (same as before the
 * selector migration). Prefer `useDatasetSelector` / `useDatasetActions` for new code.
 */
export function useAppDataset(): DatasetContextValue {
  return useDatasetSelector((value) => value);
}

/** Optional — returns null instead of throwing when outside the provider. */
export function useAppDatasetMaybe(): DatasetContextValue | null {
  return useDatasetSelectorMaybe((value) => value);
}
