"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { SummaryView } from "@/components/units/summary-view";

export default function ManagementSummaryPage() {
  const { data } = useAppDataset();
  return <SummaryView data={data} routeBasePath="/management/units" />;
}
