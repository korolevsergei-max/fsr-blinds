"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { BuildingUnits } from "./building-units";

export default function BuildingUnitsPage() {
  const { data, linkedEntityId } = useAppDataset();
  return <BuildingUnits data={data} installerId={linkedEntityId ?? "inst-1"} />;
}
