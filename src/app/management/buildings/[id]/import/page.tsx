"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { ImportUnits } from "./import-units";

export default function ImportPage() {
  const { data } = useAppDataset();
  return <ImportUnits data={data} />;
}
