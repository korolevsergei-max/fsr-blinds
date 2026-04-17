"use client";

import type { AppDataset } from "@/lib/app-dataset";
import { InstallationScheduleView } from "@/components/schedule/installation-schedule-view";

export function SchedulerScheduleView({ data }: { data: AppDataset }) {
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
