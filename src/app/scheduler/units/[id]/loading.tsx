export default function SchedulerUnitDetailLoading() {
  return (
    <div className="flex flex-col px-4 pt-6 animate-pulse">
      <div className="flex items-center gap-3 mb-6">
        <div className="skeleton w-8 h-8 rounded-lg" />
        <div>
          <div className="skeleton h-5 w-16 mb-1.5" />
          <div className="skeleton h-3 w-40" />
        </div>
      </div>
      <div className="flex gap-2 mb-4">
        <div className="skeleton h-6 w-24 rounded-full" />
        <div className="skeleton h-6 w-20 rounded-full" />
      </div>
      <div className="rounded-2xl border border-zinc-200 p-4 mb-4">
        <div className="skeleton h-3 w-24 mb-3" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <div className="skeleton h-3 w-16 mb-1" />
              <div className="skeleton h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-zinc-200 p-4">
            <div className="flex items-center justify-between">
              <div className="skeleton h-4 w-20" />
              <div className="skeleton h-5 w-5 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
