"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
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

const DatasetContext = createContext<DatasetContextValue | null>(null);

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
  const [data, setDataState] = useState(initialData);
  const [lastUpdated, setLastUpdated] = useState(0);

  const patchData = useCallback(
    (updater: (prev: AppDataset) => AppDataset) => {
      setDataState((prev) => updater(prev));
      setLastUpdated(Date.now());
    },
    []
  );

  const setData = useCallback((next: AppDataset) => {
    setDataState(next);
    setLastUpdated(Date.now());
  }, []);

  return (
    <DatasetContext.Provider
      value={{ data, user, linkedEntityId, patchData, setData, lastUpdated }}
    >
      {children}
    </DatasetContext.Provider>
  );
}

export function useAppDataset(): DatasetContextValue {
  const ctx = useContext(DatasetContext);
  if (!ctx) {
    throw new Error("useAppDataset must be used within an AppDatasetProvider");
  }
  return ctx;
}

/** Optional — returns null instead of throwing when outside the provider. */
export function useAppDatasetMaybe(): DatasetContextValue | null {
  return useContext(DatasetContext);
}
