"use client";

import type { ManufacturingRoleSchedule } from "@/lib/manufacturing-scheduler";
import { ManufacturingScheduleView } from "@/components/schedule/manufacturing-schedule-view";
import type { ScheduleScope } from "@/lib/schedule-ui";

export function ManufacturingSchedulePanel({
  cutterSchedule,
  assemblerSchedule,
  qcSchedule,
  scope,
  onScopeChange,
}: {
  cutterSchedule: ManufacturingRoleSchedule;
  assemblerSchedule: ManufacturingRoleSchedule;
  qcSchedule: ManufacturingRoleSchedule;
  scope: ScheduleScope;
  onScopeChange: (scope: ScheduleScope) => void;
}) {
  return (
    <ManufacturingScheduleView
      schedulesByRole={{
        cutter: cutterSchedule,
        assembler: assemblerSchedule,
        qc: qcSchedule,
      }}
      showRoleSelector
      unitHrefBase="/management/units"
      scope={scope}
      onScopeChange={onScopeChange}
      showScopeToggle={false}
    />
  );
}
