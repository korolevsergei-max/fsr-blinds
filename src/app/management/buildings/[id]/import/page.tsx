"use client";

import { useDatasetSlices } from "@/lib/dataset-context";
import { ImportUnits } from "./import-units";

export default function ImportPage() {
  const data = useDatasetSlices(["buildings", "clients", "installers", "schedulers"]);
  return <ImportUnits data={data} />;
}
