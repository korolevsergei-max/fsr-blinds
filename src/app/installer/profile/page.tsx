import { loadFullDataset } from "@/lib/server-data";
import { getCurrentUser, getLinkedInstallerId } from "@/lib/auth";
import { InstallerProfile } from "./installer-profile";

export default async function ProfilePage() {
  const [data, user] = await Promise.all([loadFullDataset(), getCurrentUser()]);
  const installerId = user ? await getLinkedInstallerId(user.id) : null;
  return <InstallerProfile data={data} installerId={installerId ?? "inst-1"} />;
}
