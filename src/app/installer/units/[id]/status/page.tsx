import { loadFullDataset } from "@/lib/server-data";
import { StatusUpdate } from "./status-update";

export default async function StatusUpdatePage() {
  const data = await loadFullDataset();
  return <StatusUpdate data={data} />;
}
