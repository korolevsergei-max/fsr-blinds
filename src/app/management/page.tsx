import { loadFullDataset } from "@/lib/server-data";
import { ManagementDashboard } from "./management-dashboard";

export default async function ManagementPage() {
  const data = await loadFullDataset();
  return <ManagementDashboard data={data} />;
}
