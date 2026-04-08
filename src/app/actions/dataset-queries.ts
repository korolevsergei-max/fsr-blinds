"use server";

import { loadFullDataset, loadSchedulerDataset } from "@/lib/server-data";
import type { AppDataset } from "@/lib/app-dataset";

/**
 * Server action for client-side full dataset refresh.
 * Called when the tab returns to foreground or after bulk mutations.
 */
export async function refreshDataset(
  kind: "full" | "scheduler" = "full"
): Promise<AppDataset> {
  if (kind === "scheduler") {
    return loadSchedulerDataset();
  }
  return loadFullDataset();
}
