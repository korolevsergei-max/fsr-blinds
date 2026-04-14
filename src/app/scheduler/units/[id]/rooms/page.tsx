"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { CreateRooms } from "./create-rooms";

export default function RoomsPage() {
  const { data, patchData } = useAppDataset();
  return <CreateRooms data={data} patchData={patchData} routeBasePath="/scheduler/units" />;
}
