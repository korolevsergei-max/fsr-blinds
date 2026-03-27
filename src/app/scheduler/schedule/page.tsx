import { loadFullDataset } from "@/lib/server-data";
import { SchedulerScheduleView } from "./scheduler-schedule-view";

export default async function SchedulerSchedulePage() {
  const data = await loadFullDataset();
  return <SchedulerScheduleView data={data} />;
}
