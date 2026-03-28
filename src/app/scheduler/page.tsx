import { loadSchedulerDataset } from "@/lib/server-data";
import { getCurrentUser } from "@/lib/auth";
import { SchedulerDashboard } from "./scheduler-dashboard";

export default async function SchedulerPage() {
  const [data, user] = await Promise.all([loadSchedulerDataset(), getCurrentUser()]);
  return <SchedulerDashboard data={data} userName={user?.displayName} />;
}
