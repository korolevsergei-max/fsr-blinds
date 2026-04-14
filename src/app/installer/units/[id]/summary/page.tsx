"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { SummaryView } from "./summary-view";

export default function SummaryPage() {
  const { data } = useAppDataset();
  return <SummaryView data={data} routeBasePath="/installer/units" />;
}
