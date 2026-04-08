"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { ManagementDashboard } from "./management-dashboard";

export default function ManagementPage() {
  const { data, user } = useAppDataset();
  return <ManagementDashboard data={data} userName={user.displayName} />;
}
