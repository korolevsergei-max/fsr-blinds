/**
 * Per-route skeletons for the manufacturing subroutes (cutter / assembler / qc).
 *
 * Each portal's `loading.tsx` is a route-level boundary, so without these it
 * is also the fallback for every nested segment — queue/production/completed/
 * process/units all flashed a *dashboard*-shaped skeleton before swapping to a
 * completely different layout. Each skeleton below mirrors its own screen's
 * real chrome (same sticky header, same paddings, same card rhythm) so the
 * shell lands in its final position and only the content fills in.
 *
 * Shapes are copied from:
 *   queue      → src/components/manufacturing/cutter-queue.tsx
 *   production → src/components/manufacturing/cutter-production.tsx
 *   completed  → src/components/manufacturing/manufacturing-role-completed-screen.tsx
 *   process    → src/components/manufacturing/manufacturing-process-screen.tsx
 *   unit       → src/app/cutter/units/[id]/cutter-unit-detail.tsx
 */

const STICKY_HEADER =
  "sticky top-0 z-30 border-b border-border bg-card/95 px-4 pt-4 pb-4 backdrop-blur-md";

// Tailwind extracts class names statically, so pill widths must be literal
// strings — an interpolated `w-${n}` compiles to nothing and renders 0-width.
const PILL_WIDTHS = ["w-16", "w-24", "w-20", "w-24", "w-16"] as const;

function FilterPillRow({ widths = PILL_WIDTHS }: { widths?: readonly string[] }) {
  return (
    <div className="mt-3 flex items-center gap-2 overflow-hidden pb-0.5">
      <div className="skeleton h-3.5 w-3.5 flex-shrink-0 rounded" />
      {widths.map((w, i) => (
        <div key={i} className={`skeleton h-8 flex-shrink-0 rounded-full ${w}`} />
      ))}
    </div>
  );
}

/** One unit card: header strip + N window rows. Mirrors CutterUnitCard. */
function UnitCardSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <article className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
      <div className="border-b border-border/70 bg-surface/40 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="skeleton h-[13px] w-40 rounded" />
          <div className="skeleton h-5 w-12 rounded-full" />
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="skeleton h-[11px] w-20 rounded" />
          <div className="skeleton h-[11px] w-16 rounded" />
        </div>
      </div>
      <div className="divide-y divide-border/70">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-3 px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="skeleton h-[18px] w-24 rounded" />
                <div className="skeleton h-6 w-16 rounded-full" />
              </div>
              <div className="skeleton h-[18px] w-24 rounded" />
            </div>
            <div className="skeleton h-3 w-2/3 rounded" />
          </div>
        ))}
      </div>
    </article>
  );
}

/**
 * Queue and Production share one layout: back chevron + title + trailing
 * action, then search, then the filter rail, then unit cards.
 * `titleWidth` keeps the heading block visually close to the real title
 * ("Cutting queue" vs "Production") so the swap doesn't jump.
 */
export function ManufacturingQueueSkeleton({
  titleWidth = "w-36",
  showSearch = true,
  cards = 3,
}: {
  titleWidth?: string;
  showSearch?: boolean;
  cards?: number;
}) {
  return (
    <div className="animate-pulse pb-6">
      <div className={STICKY_HEADER}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="skeleton h-9 w-9 rounded-xl" />
            <div className="space-y-1.5">
              <div className={`skeleton h-[17px] rounded ${titleWidth}`} />
              <div className="skeleton h-3 w-20 rounded" />
            </div>
          </div>
          <div className="skeleton h-8 w-20 rounded-full" />
        </div>

        {showSearch && <div className="skeleton mt-3 h-10 w-full rounded-xl" />}
        <FilterPillRow />
      </div>

      <div className="space-y-3 px-4 pt-4">
        {Array.from({ length: cards }).map((_, i) => (
          <UnitCardSkeleton key={i} rows={i === 0 ? 3 : 2} />
        ))}
      </div>
    </div>
  );
}

/** Completed: bigger display heading + sign-out, filter rail, day-grouped cards.
 *  Shared by all three portals — manufacturing-role-completed-screen.tsx. */
export function ManufacturingCompletedSkeleton() {
  return (
    <div className="animate-pulse pb-6">
      <div className="sticky top-0 z-30 border-b border-border bg-card/95 px-4 pt-5 pb-4 backdrop-blur-md">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="skeleton h-3 w-24 rounded" />
            <div className="skeleton h-[1.625rem] w-40 rounded" />
          </div>
          <div className="skeleton h-8 w-20 rounded-[var(--radius-md)]" />
        </div>
        <FilterPillRow widths={["w-24", "w-20", "w-24"]} />
      </div>

      <div className="space-y-5 px-4 pt-4">
        {Array.from({ length: 2 }).map((_, section) => (
          <div key={section} className="space-y-3">
            <div className="skeleton h-3.5 w-28 rounded" />
            <UnitCardSkeleton rows={2} />
            <UnitCardSkeleton rows={1} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Process: PageHeader block, then the wide status table. */
export function ManufacturingProcessSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="border-b border-border px-4 pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="skeleton h-3 w-20 rounded" />
            <div className="skeleton h-6 w-52 rounded" />
          </div>
          <div className="skeleton h-8 w-16 rounded-[var(--radius-md)]" />
        </div>
      </div>

      <div className="px-4 pb-1">
        <FilterPillRow widths={["w-24", "w-20", "w-24", "w-16"]} />
      </div>

      <div className="overflow-hidden px-4">
        {/* Column header strip */}
        <div className="flex items-center gap-3 border-b border-border py-2">
          <div className="skeleton h-3 w-10 flex-shrink-0 rounded" />
          <div className="skeleton h-3 w-24 flex-shrink-0 rounded" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-3 w-8 flex-shrink-0 rounded" />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, row) => (
          <div key={row} className="flex items-center gap-3 border-b border-border/60 py-3">
            <div className="skeleton h-3.5 w-10 flex-shrink-0 rounded" />
            <div className="skeleton h-3.5 w-24 flex-shrink-0 rounded" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-3.5 w-8 flex-shrink-0 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Unit detail: unit header, then room sections of window rows. */
export function ManufacturingUnitDetailSkeleton() {
  return (
    <div className="animate-pulse space-y-5 px-4 pt-4 pb-6">
      <div className="flex items-center gap-3">
        <div className="skeleton h-9 w-9 rounded-xl" />
        <div className="space-y-2">
          <div className="skeleton h-5 w-44 rounded" />
          <div className="skeleton h-3 w-28 rounded" />
        </div>
      </div>

      {Array.from({ length: 2 }).map((_, room) => (
        <div
          key={room}
          className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card"
        >
          <div className="border-b border-border/70 bg-surface/40 px-4 py-3">
            <div className="skeleton h-[13px] w-32 rounded" />
          </div>
          <div className="divide-y divide-border/70">
            {Array.from({ length: 3 }).map((_, w) => (
              <div key={w} className="flex items-center justify-between px-4 py-4">
                <div className="space-y-2">
                  <div className="skeleton h-[18px] w-28 rounded" />
                  <div className="skeleton h-3 w-20 rounded" />
                </div>
                <div className="skeleton h-[18px] w-24 rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
