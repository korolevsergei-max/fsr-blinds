"use client";

import { InstallationScheduleView, type ScheduleViewData } from "@/components/schedule/installation-schedule-view";

export function InstallerSchedule({
  data,
  installerId = "inst-1",
}: {
  data: ScheduleViewData;
  installerId?: string;
}) {
  return (
    <InstallationScheduleView
      data={data}
      installerId={installerId}
      hrefBase="/installer/units"
      title="Schedule"
      subtitle="Your installation work"
      hideClient
    />
  );
}
