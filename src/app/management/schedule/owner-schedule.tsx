"use client";

import { InstallationScheduleView, type ScheduleViewData } from "@/components/schedule/installation-schedule-view";
import type { ScheduleScope } from "@/lib/schedule-ui";

export function OwnerSchedule({
  data,
  scope,
  onScopeChange,
}: {
  data: ScheduleViewData;
  scope: ScheduleScope;
  onScopeChange: (scope: ScheduleScope) => void;
}) {
  return (
    <InstallationScheduleView
      data={data}
      hrefBase="/management/units"
      showInstaller
      showHeader={false}
      scope={scope}
      onScopeChange={onScopeChange}
      showScopeToggle={false}
    />
  );
}
