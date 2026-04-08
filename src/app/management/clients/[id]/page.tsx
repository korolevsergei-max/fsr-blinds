"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { ClientDetail } from "./client-detail";

export default function ClientDetailPage() {
  const { data, user } = useAppDataset();
  return <ClientDetail data={data} userRole={user.role} />;
}
