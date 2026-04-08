"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { InstallerHome } from "./installer-home";

export default function InstallerPage() {
  const { data, linkedEntityId } = useAppDataset();
  return <InstallerHome data={data} installerId={linkedEntityId ?? "inst-1"} />;
}
