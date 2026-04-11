"use client";

import { useDatasetSelector } from "@/lib/dataset-context";
import { ClientsList } from "./clients-list";

export default function ClientsPage() {
  const clients = useDatasetSelector((value) => value.data.clients);
  const buildings = useDatasetSelector((value) => value.data.buildings);
  const units = useDatasetSelector((value) => value.data.units);

  return <ClientsList clients={clients} buildings={buildings} units={units} />;
}
