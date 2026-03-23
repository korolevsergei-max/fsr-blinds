export default function ManagementLoading() {
  return (
    <div className="flex flex-col px-4 pt-6 animate-pulse">
      {/* Header skeleton */}
      <div className="mb-6">
        <div className="skeleton h-3 w-20 mb-2" />
        <div className="skeleton h-5 w-28" />
      </div>

      {/* KPI grid skeleton */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-200 p-4"
          >
            <div className="skeleton w-9 h-9 rounded-xl mb-3" />
            <div className="skeleton h-7 w-12 mb-1" />
            <div className="skeleton h-3 w-24" />
          </div>
        ))}
      </div>

      {/* Pipeline skeleton */}
      <div className="skeleton h-3 w-32 mb-3" />
      <div className="rounded-2xl border border-zinc-200 divide-y divide-zinc-200">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3">
            <div className="skeleton h-6 w-32 rounded-full" />
            <div className="skeleton h-4 w-6" />
          </div>
        ))}
      </div>
    </div>
  );
}
