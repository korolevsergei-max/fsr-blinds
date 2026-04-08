"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { InstallerProfile } from "./installer-profile";

export default function ProfilePage() {
  const { data, linkedEntityId } = useAppDataset();
  return <InstallerProfile data={data} installerId={linkedEntityId ?? "inst-1"} />;
}
