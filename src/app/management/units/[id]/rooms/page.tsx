"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { CreateRooms } from "@/components/rooms/create-rooms";

export default function ManagementRoomsPage() {
  const { data, patchData } = useAppDataset();
  return <CreateRooms data={data} patchData={patchData} routeBasePath="/management/units" />;
}
