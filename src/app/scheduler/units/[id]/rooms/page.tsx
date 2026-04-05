import { loadSchedulerDataset } from "@/lib/server-data";
import { CreateRooms } from "./create-rooms";

export default async function RoomsPage() {
  const data = await loadSchedulerDataset();
  return <CreateRooms data={data} />;
}
