"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { AppDataset } from "./app-dataset";
import type { AppUser } from "./auth";

type DatasetContextValue = {
  data: AppDataset;
  user: AppUser;
  /** Linked entity ID for the current portal (e.g. installerId, schedulerId). */
  linkedEntityId: string | null;
  /** Optimistically patch the in-memory dataset. */
  patchData: (updater: (prev: AppDataset) => AppDataset) => void;
  /** Replace the entire dataset (used after full refetch). */
  setData: (next: AppDataset) => void;
  /** Timestamp of last data update (ms). */
  lastUpdated: number;
};

type DatasetSnapshot = Omit<DatasetContextValue, "patchData" | "setData">;

type DatasetStore = {
  getSnapshot: () => DatasetSnapshot;
  subscribe: (listener: () => void) => () => void;
  patchData: (updater: (prev: AppDataset) => AppDataset) => void;
  setData: (next: AppDataset) => void;
  syncMeta: (user: AppUser, linkedEntityId: string | null) => void;
};

const DatasetContext = createContext<DatasetStore | null>(null);
const EMPTY_SUBSCRIBE = () => () => {};

function createDatasetStore(initialSnapshot: DatasetSnapshot): DatasetStore {
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();

  const emit = () => {
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    patchData: (updater) => {
      const nextData = updater(snapshot.data);
      if (Object.is(nextData, snapshot.data)) return;
      snapshot = {
        ...snapshot,
        data: nextData,
        lastUpdated: Date.now(),
      };
      emit();
    },
    setData: (nextData) => {
      if (Object.is(nextData, snapshot.data)) return;
      snapshot = {
        ...snapshot,
        data: nextData,
        lastUpdated: Date.now(),
      };
      emit();
    },
    syncMeta: (nextUser, nextLinkedEntityId) => {
      if (
        snapshot.user.id === nextUser.id &&
        snapshot.user.email === nextUser.email &&
        snapshot.user.role === nextUser.role &&
        snapshot.user.displayName === nextUser.displayName &&
        snapshot.linkedEntityId === nextLinkedEntityId
      ) {
        return;
      }

      snapshot = {
        ...snapshot,
        user: nextUser,
        linkedEntityId: nextLinkedEntityId,
      };
      emit();
    },
  };
}

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

function getDatasetContextValue(store: DatasetStore): DatasetContextValue {
  const snapshot = store.getSnapshot();
  return {
    ...snapshot,
    patchData: store.patchData,
    setData: store.setData,
  };
}

function useDatasetStoreValue<T>(
  store: DatasetStore,
  selector: (value: DatasetContextValue) => T
): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(getDatasetContextValue(store)),
    () => selector(getDatasetContextValue(store))
  );
}

function useOptionalDatasetStoreValue<T>(
  store: DatasetStore | null,
  selector: (value: DatasetContextValue) => T
): T | null {
  return useSyncExternalStore(
    store?.subscribe ?? EMPTY_SUBSCRIBE,
    () => (store ? selector(getDatasetContextValue(store)) : null),
    () => (store ? selector(getDatasetContextValue(store)) : null)
  );
}

export function useDatasetSelector<T>(
  selector: (value: DatasetContextValue) => T
): T {
  const store = useContext(DatasetContext);
  if (!store) {
    throw new Error("useDatasetSelector must be used within an AppDatasetProvider");
  }
  return useDatasetStoreValue(store, selector);
}

export function useAppDataset(): DatasetContextValue {
  return useDatasetSelector((value) => value);
}

/** Optional — returns null instead of throwing when outside the provider. */
export function useAppDatasetMaybe(): DatasetContextValue | null {
  const store = useContext(DatasetContext);
  return useOptionalDatasetStoreValue(store, (value) => value);
}
