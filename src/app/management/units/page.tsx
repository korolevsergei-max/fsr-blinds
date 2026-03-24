import { loadFullDataset } from "@/lib/server-data";
import { UnitsList } from "./units-list";

export default async function UnitsPage() {
  const data = await loadFullDataset();
  return <UnitsList data={data} />;
}
