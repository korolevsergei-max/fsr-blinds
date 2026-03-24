import { loadFullDataset } from "@/lib/server-data";
import { UnitDetail } from "./unit-detail";

export default async function UnitDetailPage() {
  const data = await loadFullDataset();
  return <UnitDetail data={data} />;
}
