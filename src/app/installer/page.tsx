"use client";

import { useDatasetSlices, useDatasetSelector } from "@/lib/dataset-context";
import { InstallerHome } from "./installer-home";

export default function InstallerPage() {
  const data = useDatasetSlices(["installers", "units"]);
  const installerId = useDatasetSelector((value) => value.linkedEntityId);
  return <InstallerHome data={data} installerId={installerId ?? "inst-1"} />;
}
