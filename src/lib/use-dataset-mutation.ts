"use client";

import { useRouter } from "next/navigation";
import { useDatasetActionsMaybe } from "./dataset-context";
import type { AppDataset } from "./app-dataset";

/**
 * Hook for performing mutations with optimistic dataset updates.
 *
 * When inside an AppDatasetProvider, `afterMutate` patches the in-memory
 * dataset so the UI updates instantly. Falls back to `router.refresh()`
 * when outside the provider (e.g., server-component-only pages).
 */
export function useDatasetMutation() {
  const actions = useDatasetActionsMaybe();
  const router = useRouter();

  /**
   * Call after a successful server action to update the local dataset.
   * If no updater is provided, falls back to router.refresh().
   */
  function afterMutate(updater?: (prev: AppDataset) => AppDataset) {
    if (actions && updater) {
      actions.patchData(updater);
    } else {
      router.refresh();
    }
  }

  return { afterMutate };
}
