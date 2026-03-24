import { loadFullDataset } from "@/lib/server-data";
import { CreateRooms } from "./create-rooms";

export default async function RoomsPage() {
  const data = await loadFullDataset();
  return <CreateRooms data={data} />;
}
