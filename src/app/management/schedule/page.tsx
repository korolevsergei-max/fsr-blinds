import { loadFullDataset } from "@/lib/server-data";
import { OwnerSchedule } from "./owner-schedule";

export default async function SchedulePage() {
  const data = await loadFullDataset();
  return <OwnerSchedule data={data} />;
}
