/**
 * Skeletons for the manufacturing role dashboards (cutter / assembler / qc).
 * `ManufacturingPipelineSkeleton` is the data-heavy portion and doubles as the
 * in-page <Suspense> fallback while the persisted schedule loads. The full
 * skeleton (header + pipeline) backs the route-level loading.tsx.
 */
export function ManufacturingPipelineSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <div className="skeleton h-9 w-28 rounded-full" />
        <div className="skeleton h-9 w-24 rounded-full" />
      </div>

      {/* Pipeline section cards */}
      {Array.from({ length: 3 }).map((_, section) => (
        <div
          key={section}
          className="rounded-2xl border border-zinc-200 divide-y divide-zinc-200"
        >
          <div className="flex items-center justify-between px-4 py-3">
            <div className="skeleton h-4 w-28" />
            <div className="skeleton h-5 w-6 rounded-full" />
          </div>
          {Array.from({ length: 2 }).map((_, row) => (
            <div key={row} className="flex items-center justify-between px-4 py-3">
              <div className="space-y-2">
                <div className="skeleton h-4 w-40" />
                <div className="skeleton h-3 w-24" />
              </div>
              <div className="skeleton h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ManufacturingDashboardSkeleton() {
  return (
    <div className="space-y-5 px-4 pt-5 pb-4">
      {/* Header skeleton (mirrors ManufacturingRoleDashboard header) */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="skeleton h-3 w-20" />
          <div className="skeleton h-7 w-28" />
        </div>
        <div className="skeleton h-8 w-20 rounded-[var(--radius-md)]" />
      </div>

      <ManufacturingPipelineSkeleton />
    </div>
  );
}
