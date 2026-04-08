"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { SchedulerDashboard } from "./scheduler-dashboard";

export default function SchedulerPage() {
  const { data, user } = useAppDataset();
  return <SchedulerDashboard data={data} userName={user.displayName} />;
}
