import { loadFullDataset } from "@/lib/server-data";
import { getCurrentUser, getLinkedInstallerId } from "@/lib/auth";
import { InstallerHome } from "./installer-home";

export default async function InstallerPage() {
  const [data, user] = await Promise.all([loadFullDataset(), getCurrentUser()]);
  const installerId = user ? await getLinkedInstallerId(user.id) : null;
  return <InstallerHome data={data} installerId={installerId ?? "inst-1"} />;
}
