export default function InstallerLoading() {
  return (
    <div className="flex flex-col px-4 pt-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="skeleton h-3 w-20 mb-2" />
          <div className="skeleton h-5 w-40" />
        </div>
        <div className="skeleton w-10 h-10 rounded-full" />
      </div>

      {/* Search skeleton */}
      <div className="skeleton h-11 w-full rounded-xl mb-4" />

      {/* Filter chips */}
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-8 w-20 rounded-full" />
        ))}
      </div>

      {/* Card skeletons */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-200 p-4"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="skeleton w-9 h-9 rounded-xl" />
              <div>
                <div className="skeleton h-4 w-24 mb-1.5" />
                <div className="skeleton h-3 w-36" />
              </div>
            </div>
            <div className="skeleton h-3 w-32 mb-3" />
            <div className="flex items-center justify-between">
              <div className="skeleton h-6 w-28 rounded-full" />
              <div className="skeleton h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
