import { loadFullDataset } from "@/lib/server-data";
import { getCurrentUser, getLinkedInstallerId } from "@/lib/auth";
import { InstallerSchedule } from "./installer-schedule";

export default async function SchedulePage() {
  const [data, user] = await Promise.all([loadFullDataset(), getCurrentUser()]);
  const installerId = user ? await getLinkedInstallerId(user.id) : null;
  return <InstallerSchedule data={data} installerId={installerId ?? "inst-1"} />;
}
