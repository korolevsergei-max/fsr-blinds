export default function ScheduleLoading() {
  return (
    <div className="animate-pulse px-4 pt-6">
      {/* Header */}
      <div className="mb-6">
        <div className="skeleton h-3 w-20 mb-2" />
        <div className="skeleton h-5 w-32" />
      </div>

      {/* Scope tabs */}
      <div className="mb-6 flex gap-2">
        <div className="skeleton h-9 w-24 rounded-full" />
        <div className="skeleton h-9 w-28 rounded-full" />
        <div className="skeleton h-9 w-20 rounded-full" />
      </div>

      {/* Day columns */}
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, day) => (
          <div key={day} className="rounded-2xl border border-zinc-200 p-4">
            <div className="skeleton h-4 w-32 mb-3" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, row) => (
                <div key={row} className="skeleton h-12 w-full rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
