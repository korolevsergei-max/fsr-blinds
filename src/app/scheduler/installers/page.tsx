import { loadFullDataset } from "@/lib/server-data";
import { SchedulerInstallers } from "./scheduler-installers";

export default async function SchedulerInstallersPage() {
  const data = await loadFullDataset();
  return <SchedulerInstallers data={data} />;
}
