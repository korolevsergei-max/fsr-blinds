"use client";

import { useDatasetSelector, shallowEqual } from "@/lib/dataset-context";
import type { ScheduleViewData } from "@/components/schedule/installation-schedule-view";
import { SchedulerScheduleView } from "./scheduler-schedule-view";

export default function SchedulerSchedulePage() {
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
  return <SchedulerScheduleView data={data} />;
}
