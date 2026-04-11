"use client";

import { useDatasetSelector } from "@/lib/dataset-context";
import { InstallersList } from "./installers-list";

export default function InstallersPage() {
  const installers = useDatasetSelector((value) => value.data.installers);
  const units = useDatasetSelector((value) => value.data.units);

  return <InstallersList installers={installers} units={units} />;
}
