import { loadFullDataset } from "@/lib/server-data";
import { getCurrentUser } from "@/lib/auth";
import { BuildingDetail } from "./building-detail";

export default async function BuildingDetailPage() {
  const data = await loadFullDataset();
  const user = await getCurrentUser();
  return <BuildingDetail data={data} userRole={user?.role} />;
}
