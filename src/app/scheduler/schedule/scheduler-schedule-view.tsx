"use client";

import { InstallationScheduleView, type ScheduleViewData } from "@/components/schedule/installation-schedule-view";

export function SchedulerScheduleView({ data }: { data: ScheduleViewData }) {
  return (
    <InstallationScheduleView
      data={data}
      hrefBase="/scheduler/units"
      showInstaller
      title="Schedule"
      subtitle="Installation schedule"
      hideClient
    />
  );
}
