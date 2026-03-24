import { loadFullDataset } from "@/lib/server-data";
import { InstallerProfile } from "./installer-profile";

export default async function ProfilePage() {
  const data = await loadFullDataset();
  return <InstallerProfile data={data} />;
}
