"use client";

import type { AppDataset } from "@/lib/app-dataset";
import { InstallationScheduleView } from "@/components/schedule/installation-schedule-view";

export function InstallerSchedule({
  data,
  installerId = "inst-1",
}: {
  data: AppDataset;
  installerId?: string;
}) {
  return (
    <InstallationScheduleView
      data={data}
      installerId={installerId}
      hrefBase="/installer/units"
      title="Schedule"
      subtitle="Your installation work"
    />
  );
}
