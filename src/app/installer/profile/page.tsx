"use client";

import { useDatasetSlices, useDatasetSelector } from "@/lib/dataset-context";
import { InstallerProfile } from "./installer-profile";

export default function ProfilePage() {
  const data = useDatasetSlices(["installers", "units"]);
  const installerId = useDatasetSelector((value) => value.linkedEntityId);
  return <InstallerProfile data={data} installerId={installerId ?? "inst-1"} />;
}
