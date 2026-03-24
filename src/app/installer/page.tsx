import { loadFullDataset } from "@/lib/server-data";
import { InstallerHome } from "./installer-home";

export default async function InstallerPage() {
  const data = await loadFullDataset();
  return <InstallerHome data={data} />;
}
