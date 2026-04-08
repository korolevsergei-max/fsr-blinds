"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { AssignUnit } from "./assign-unit";

export default function AssignPage() {
  const { data } = useAppDataset();
  return <AssignUnit data={data} />;
}
