import { loadFullDataset } from "@/lib/server-data";
import { RoomDetail } from "./room-detail";

export default async function RoomDetailPage() {
  const data = await loadFullDataset();
  return <RoomDetail data={data} />;
}
