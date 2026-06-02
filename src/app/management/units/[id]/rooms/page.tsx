"use client";

import { useDatasetSlices, useDatasetActions } from "@/lib/dataset-context";
import { CreateRooms } from "@/components/rooms/create-rooms";

export default function ManagementRoomsPage() {
  const data = useDatasetSlices(["units", "rooms"]);
  const { patchData } = useDatasetActions();
  return <CreateRooms data={data} patchData={patchData} routeBasePath="/management/units" />;
}
