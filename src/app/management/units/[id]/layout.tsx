import { getCurrentUser } from "@/lib/auth";
import { loadUnitDetail } from "@/lib/server-data";
import { ScopedUnitDatasetShell } from "@/components/data/scoped-unit-dataset-shell";

/**
 * Route-segment layout for the management unit-detail subtree (DATA_SCOPING_PLAN Phase 1).
 *
 * Server-fetches a single unit's scope and mounts a nested `AppDatasetProvider` (via
 * `ScopedUnitDatasetShell`) so the detail/edit/assign components read ~1 unit instead of the whole
 * DB — with zero component changes. `loadFullDataset` stays intact in the parent management layout,
 * so removing this file falls every component back to the global (full) provider instantly.
 *
 * `key={id}` forces a fresh store + realtime subscription per unit: the `[id]` layout is shared
 * across unit ids and `AppDatasetProvider` builds its store once (ignoring later `initialData`), so
 * without the key, navigating unit A→B would keep A's one-unit store and render "Unit not found".
 * The key is stable across sub-navigation within a unit (rooms/windows/summary), preserving
 * optimistic patches there.
 */
export default async function UnitDetailLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  // The parent management layout already enforces auth + owner; if somehow unauthenticated, render
  // children without the nested provider so they fall back to the parent (full) provider.
  if (!user) {
    return <>{children}</>;
  }

  const data = await loadUnitDetail(id);

  return (
    <ScopedUnitDatasetShell key={id} unitId={id} initialData={data} user={user}>
      {children}
    </ScopedUnitDatasetShell>
  );
}
