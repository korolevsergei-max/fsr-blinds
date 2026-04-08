"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { OwnerSchedule } from "./owner-schedule";

export default function SchedulePage() {
  const { data } = useAppDataset();
  return <OwnerSchedule data={data} />;
}
