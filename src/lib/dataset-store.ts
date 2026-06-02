import type { AppDataset } from "./app-dataset";
import type { AppUser } from "./auth";

/** Immutable, data-only slice of the store. A new object is allocated on every change. */
export type DatasetSnapshot = {
  data: AppDataset;
  user: AppUser;
  /** Linked entity ID for the current portal (e.g. installerId, schedulerId). */
  linkedEntityId: string | null;
  /** True while a deferred portal is still waiting on its first non-empty dataset refresh. */
  isHydratingInitialData: boolean;
  /** Timestamp of last data update (ms). */
  lastUpdated: number;
};

/** Stable action handlers exposed by the store (referentially constant for the store's life). */
export type DatasetActions = {
  /** Optimistically patch the in-memory dataset. */
  patchData: (updater: (prev: AppDataset) => AppDataset) => void;
  /** Replace the entire dataset (used after full refetch). */
  setData: (next: AppDataset) => void;
};

/** The full value selectors receive: the current snapshot plus the stable actions. */
export type DatasetContextValue = DatasetSnapshot & DatasetActions;

export type DatasetStore = {
  getSnapshot: () => DatasetSnapshot;
  subscribe: (listener: () => void) => () => void;
  patchData: DatasetActions["patchData"];
  setData: DatasetActions["setData"];
  syncMeta: (user: AppUser, linkedEntityId: string | null) => void;
};

/**
 * Creates the dataset store. Each mutation allocates a fresh top-level snapshot object but
 * preserves the references of unchanged slices — that referential stability is what lets
 * `useSyncExternalStoreWithSelector` bail out of re-renders per slice in `dataset-context.tsx`.
 */
export function createDatasetStore(initialSnapshot: DatasetSnapshot): DatasetStore {
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
        isHydratingInitialData: false,
        lastUpdated: Date.now(),
      };
      emit();
    },
    setData: (nextData) => {
      if (Object.is(nextData, snapshot.data)) return;
      snapshot = {
        ...snapshot,
        data: nextData,
        isHydratingInitialData: false,
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
