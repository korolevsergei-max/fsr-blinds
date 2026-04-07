import { loadUnitDetail } from "@/lib/server-data";
import { CreateRooms } from "./create-rooms";

export default async function RoomsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadUnitDetail(id);
  return <CreateRooms data={data} />;
}
