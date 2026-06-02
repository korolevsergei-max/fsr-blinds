"use client";

import { useDatasetSlices, useDatasetSelector } from "@/lib/dataset-context";
import { BuildingUnits } from "./building-units";

export default function BuildingUnitsPage() {
  const data = useDatasetSlices(["buildings", "units"]);
  const installerId = useDatasetSelector((value) => value.linkedEntityId);
  return <BuildingUnits data={data} installerId={installerId ?? "inst-1"} />;
}
