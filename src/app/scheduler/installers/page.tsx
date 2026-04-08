"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { SchedulerInstallers } from "./scheduler-installers";

export default function SchedulerInstallersPage() {
  const { data } = useAppDataset();
  return <SchedulerInstallers data={data} />;
}
