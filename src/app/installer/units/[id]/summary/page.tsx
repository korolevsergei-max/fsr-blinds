"use client";

import { useDatasetSlices } from "@/lib/dataset-context";
import { SummaryView } from "./summary-view";

export default function SummaryPage() {
  const data = useDatasetSlices(["units", "rooms", "windows"]);
  return <SummaryView data={data} routeBasePath="/installer/units" />;
}
