"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { CreateRooms } from "./create-rooms";

export default function InstallerRoomsPage() {
  const { data } = useAppDataset();
  return <CreateRooms data={data} />;
}
