import { loadFullDataset } from "@/lib/server-data";
import { BuildingDetail } from "./building-detail";

export default async function BuildingDetailPage() {
  const data = await loadFullDataset();
  return <BuildingDetail data={data} />;
}
