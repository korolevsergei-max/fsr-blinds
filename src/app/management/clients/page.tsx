"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { ClientsList } from "./clients-list";

export default function ClientsPage() {
  const { data } = useAppDataset();
  return <ClientsList data={data} />;
}
