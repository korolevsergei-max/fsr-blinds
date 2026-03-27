import { loadFullDataset } from "@/lib/server-data";
import { getCurrentUser, getLinkedInstallerId } from "@/lib/auth";
import { BuildingUnits } from "./building-units";

export default async function BuildingUnitsPage() {
  const [data, user] = await Promise.all([loadFullDataset(), getCurrentUser()]);
  const installerId = user ? await getLinkedInstallerId(user.id) : null;
  return <BuildingUnits data={data} installerId={installerId ?? "inst-1"} />;
}
