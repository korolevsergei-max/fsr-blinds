export default function SchedulerLoading() {
  return (
    <div className="flex flex-col px-4 pt-6 animate-pulse">
      <div className="mb-6">
        <div className="skeleton h-3 w-20 mb-2" />
        <div className="skeleton h-5 w-32" />
      </div>
      <div className="skeleton h-11 w-full rounded-xl mb-4" />
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-8 w-20 rounded-full" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-zinc-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="skeleton h-4 w-16 mb-1.5" />
                <div className="skeleton h-3 w-40" />
              </div>
              <div className="skeleton h-6 w-24 rounded-full" />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
              <div className="skeleton h-3 w-48" />
              <div className="skeleton h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
