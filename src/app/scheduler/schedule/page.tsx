"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { SchedulerScheduleView } from "./scheduler-schedule-view";

export default function SchedulerSchedulePage() {
  const { data } = useAppDataset();
  return <SchedulerScheduleView data={data} />;
}
