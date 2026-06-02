"use client";

import { useDatasetSlices, useDatasetActions } from "@/lib/dataset-context";
import { CreateRooms } from "./create-rooms";

export default function InstallerRoomsPage() {
  const data = useDatasetSlices(["units", "rooms"]);
  const { patchData } = useDatasetActions();
  return <CreateRooms data={data} patchData={patchData} routeBasePath="/installer/units" />;
}
