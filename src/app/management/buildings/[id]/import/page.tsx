import { loadFullDataset } from "@/lib/server-data";
import { ImportUnits } from "./import-units";

export default async function ImportPage() {
  const data = await loadFullDataset();
  return <ImportUnits data={data} />;
}
