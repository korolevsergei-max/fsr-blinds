import { loadFullDataset } from "@/lib/server-data";
import { ManagementUnitDetail } from "./management-unit-detail";

export default async function ManagementUnitDetailPage() {
  const data = await loadFullDataset();
  return <ManagementUnitDetail data={data} />;
}
