import { getCurrentUser } from "@/lib/auth";
import { loadAssemblerDataset } from "@/lib/assembler-data";
import { computeAndUpdateManufacturingRisk } from "@/app/actions/production-actions";
import { AssemblerDashboard } from "./assembler-dashboard";

export default async function AssemblerPage() {
  await computeAndUpdateManufacturingRisk();

  const [data, user] = await Promise.all([
    loadAssemblerDataset(),
    getCurrentUser(),
  ]);

  return <AssemblerDashboard data={data} userName={user?.displayName} />;
}
