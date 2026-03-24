import { loadFullDataset } from "@/lib/server-data";
import { InstallerSchedule } from "./installer-schedule";

export default async function SchedulePage() {
  const data = await loadFullDataset();
  return <InstallerSchedule data={data} />;
}
