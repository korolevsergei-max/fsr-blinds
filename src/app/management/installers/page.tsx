import { loadFullDataset } from "@/lib/server-data";
import { InstallersList } from "./installers-list";

export default async function InstallersPage() {
  const data = await loadFullDataset();
  return <InstallersList data={data} />;
}
