import { loadFullDataset } from "@/lib/server-data";
import { ManagementRoomDetail } from "./management-room-detail";

export default async function ManagementRoomDetailPage() {
  const data = await loadFullDataset();
  return <ManagementRoomDetail data={data} />;
}
