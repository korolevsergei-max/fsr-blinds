"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { CalendarBlank, Factory } from "@phosphor-icons/react";
import { useDatasetSelector, shallowEqual } from "@/lib/dataset-context";
import type { ScheduleViewData } from "@/components/schedule/installation-schedule-view";
import type { ManufacturingRoleSchedule } from "@/lib/manufacturing-scheduler";
import { SCHEDULE_SCOPE_LABELS, type ScheduleScope } from "@/lib/schedule-ui";
import { OwnerSchedule } from "./owner-schedule";
import { ManufacturingSchedulePanel } from "./manufacturing-schedule-panel";

export type ManufacturingSchedules = {
  cutter: ManufacturingRoleSchedule;
  assembler: ManufacturingRoleSchedule;
  qc: ManufacturingRoleSchedule;
};

export function ScheduleScreen({
  manufacturingSchedulesPromise,
}: {
  manufacturingSchedulesPromise: Promise<ManufacturingSchedules>;
}) {
  const data = useDatasetSelector<ScheduleViewData>(
    (value) => ({
      units: value.data.units,
      installers: value.data.installers,
      schedule: value.data.schedule,
      clients: value.data.clients,
      buildings: value.data.buildings,
      manufacturingEscalations: value.data.manufacturingEscalations,
    }),
    shallowEqual
  );
  const [tab, setTab] = useState<"installer" | "manufacturing">("installer");
  const [scope, setScope] = useState<ScheduleScope>("week");
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [stickyTop, setStickyTop] = useState(188);

  useEffect(() => {
    const node = headerRef.current;
    if (!node) return;

    const updateHeight = () => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      if (next > 0) {
        setStickyTop(next);
      }
    };

    updateHeight();

    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(node);
    window.addEventListener("resize", updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, []);

  return (
    <div className="flex flex-col" style={{ ["--schedule-sticky-top" as string]: `${stickyTop}px` }}>
      <div ref={headerRef} className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="border-b border-border/60 px-4 py-4">
          <h1 className="text-[17px] sm:text-[18px] font-semibold tracking-tight text-foreground truncate leading-snug">
            Schedule
          </h1>
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setTab("installer")}
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
                  tab === "installer"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-secondary hover:bg-surface",
                ].join(" ")}
              >
                <CalendarBlank size={16} weight={tab === "installer" ? "fill" : "regular"} />
                Installation
              </button>
              <button
                onClick={() => setTab("manufacturing")}
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
                  tab === "manufacturing"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-secondary hover:bg-surface",
                ].join(" ")}
              >
                <Factory size={16} weight={tab === "manufacturing" ? "fill" : "regular"} />
                Manufacturing
              </button>
            </div>

            <div className="ml-3 flex flex-shrink-0 rounded-lg bg-zinc-100 p-0.5">
              {(Object.keys(SCHEDULE_SCOPE_LABELS) as ScheduleScope[]).map((value) => (
                <button
                  key={value}
                  onClick={() => setScope(value)}
                  className={`rounded-md px-3 py-1.5 text-[10px] font-semibold transition-all ${
                    scope === value ? "bg-white text-zinc-900 shadow-sm" : "text-muted"
                  }`}
                >
                  {SCHEDULE_SCOPE_LABELS[value]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {tab === "installer" ? (
        <OwnerSchedule data={data} scope={scope} onScopeChange={setScope} />
      ) : (
        <Suspense fallback={<ManufacturingScheduleFallback />}>
          <ManufacturingSchedulePanel
            schedulesPromise={manufacturingSchedulesPromise}
            scope={scope}
            onScopeChange={setScope}
          />
        </Suspense>
      )}
    </div>
  );
}

function ManufacturingScheduleFallback() {
  return (
    <div className="space-y-3 px-4 py-6">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-xl border border-border bg-surface"
        />
      ))}
    </div>
  );
}
