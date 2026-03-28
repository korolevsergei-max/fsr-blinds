import { loadSchedulerDataset } from "@/lib/server-data";
import { SchedulerInstallers } from "./scheduler-installers";

export default async function SchedulerInstallersPage() {
  const data = await loadSchedulerDataset();
  return <SchedulerInstallers data={data} />;
}
