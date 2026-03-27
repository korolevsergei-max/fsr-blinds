import { loadFullDataset } from "@/lib/server-data";
import { getCurrentUser } from "@/lib/auth";
import { ManagementDashboard } from "./management-dashboard";

export default async function ManagementPage() {
  const [data, user] = await Promise.all([loadFullDataset(), getCurrentUser()]);
  return <ManagementDashboard data={data} userName={user?.displayName} />;
}
