"use client";

import { use } from "react";
import { ManufacturingScheduleView } from "@/components/schedule/manufacturing-schedule-view";
import type { ScheduleScope } from "@/lib/schedule-ui";
import type { ManufacturingSchedules } from "./schedule-screen";

export function ManufacturingSchedulePanel({
  schedulesPromise,
  scope,
  onScopeChange,
}: {
  schedulesPromise: Promise<ManufacturingSchedules>;
  scope: ScheduleScope;
  onScopeChange: (scope: ScheduleScope) => void;
}) {
  // Unwraps the streamed promise — suspends (showing the parent's Suspense fallback)
  // until the role schedules resolve. Only mounted on the manufacturing tab, so the
  // default installer tab never blocks on it.
  const { cutter, assembler, qc } = use(schedulesPromise);
  return (
    <ManufacturingScheduleView
      schedulesByRole={{
        cutter,
        assembler,
        qc,
      }}
      showRoleSelector
      unitHrefBase="/management/units"
      scope={scope}
      onScopeChange={onScopeChange}
      showScopeToggle={false}
    />
  );
}
