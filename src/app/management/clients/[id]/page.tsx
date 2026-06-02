"use client";

import { useDatasetSlices, useDatasetSelector } from "@/lib/dataset-context";
import { ClientDetail } from "./client-detail";

export default function ClientDetailPage() {
  const data = useDatasetSlices(["clients", "buildings", "units"]);
  const userRole = useDatasetSelector((value) => value.user.role);
  return <ClientDetail data={data} userRole={userRole} />;
}
