import { loadFullDataset } from "@/lib/server-data";
import { AssignUnit } from "./assign-unit";

export default async function AssignPage() {
  const data = await loadFullDataset();
  return <AssignUnit data={data} />;
}
