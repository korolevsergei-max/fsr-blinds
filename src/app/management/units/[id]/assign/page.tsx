"use client";

import { useDatasetSlices } from "@/lib/dataset-context";
import { AssignUnit } from "./assign-unit";

export default function AssignPage() {
  const data = useDatasetSlices(["units", "installers"]);
  return <AssignUnit data={data} />;
}
