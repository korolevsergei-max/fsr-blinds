"use client";

import { useDatasetSlices, useDatasetActions } from "@/lib/dataset-context";
import { CreateRooms } from "./create-rooms";

export default function RoomsPage() {
  const data = useDatasetSlices(["units", "rooms"]);
  const { patchData } = useDatasetActions();
  return <CreateRooms data={data} patchData={patchData} routeBasePath="/scheduler/units" />;
}
