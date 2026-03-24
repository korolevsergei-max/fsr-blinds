import { loadFullDataset } from "@/lib/server-data";
import { BuildingUnits } from "./building-units";

export default async function BuildingUnitsPage() {
  const data = await loadFullDataset();
  return <BuildingUnits data={data} />;
}
