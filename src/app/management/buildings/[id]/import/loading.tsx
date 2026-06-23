export default function ImportUnitsLoading() {
  return (
    <div className="flex flex-col px-4 pt-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center gap-3 mb-6">
        <div className="skeleton w-8 h-8 rounded-lg" />
        <div>
          <div className="skeleton h-5 w-28 mb-1.5" />
          <div className="skeleton h-3 w-40" />
        </div>
      </div>

      {/* Mode toggle skeleton */}
      <div className="skeleton h-11 w-full rounded-xl mb-5" />

      {/* Input area skeleton */}
      <div className="skeleton h-40 w-full rounded-2xl mb-3" />
      <div className="skeleton h-10 w-full rounded-xl" />
    </div>
  );
}
