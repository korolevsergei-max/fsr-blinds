"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { CreateRooms } from "./create-rooms";

export default function RoomsPage() {
  const { data } = useAppDataset();
  return <CreateRooms data={data} />;
}
