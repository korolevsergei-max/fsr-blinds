"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { InstallersList } from "./installers-list";

export default function InstallersPage() {
  const { data } = useAppDataset();
  return <InstallersList data={data} />;
}
