import { getCurrentUser } from "@/lib/auth";
import { loadSchedulerUnitDetail } from "@/lib/server-data";
import { refreshSchedulerUnitDetail } from "@/app/actions/dataset-queries";
import { ScopedUnitDatasetShell } from "@/components/data/scoped-unit-dataset-shell";

/**
 * Route-segment layout for the scheduler unit-detail subtree (Phase 10).
 *
 * Since the global scheduler payload stopped shipping raw rooms/windows (mirroring the owner
 * path), this mounts a NESTED `AppDatasetProvider` seeded with just this unit's scope via
 * `loadSchedulerUnitDetail` — which applies the per-unit scheduler scope guard and the team
 * installer pick-list, so visibility is not widened. Detail/rooms/windows/assign/summary pages
 * read the nearest provider, so they see this one unit with zero component changes.
 *
 * `key={id}` forces a fresh store + realtime subscription per unit (the `[id]` layout is shared
 * across ids and `AppDatasetProvider` builds its store once), matching the management subtree.
 * The realtime bridge uses `refreshSchedulerUnitDetail` (scheduler-gated) instead of the
 * owner-only default so live refreshes keep the scoped installer list.
 */
export default async function SchedulerUnitDetailLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  // The parent scheduler layout already enforces auth + scheduler role. If somehow not a
  // scheduler, render children without the nested provider (falls back to the parent provider).
  if (!user || user.role !== "scheduler") {
    return <>{children}</>;
  }

  // loadSchedulerUnitDetail returns an empty dataset for out-of-scope units, so the nested
  // provider renders "not found" rather than leaking an out-of-scope unit's data.
  const data = await loadSchedulerUnitDetail(id);

  return (
    <ScopedUnitDatasetShell
      key={id}
      unitId={id}
      initialData={data}
      user={user}
      refreshAction={refreshSchedulerUnitDetail}
    >
      {children}
    </ScopedUnitDatasetShell>
  );
}
