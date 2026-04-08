import { getCurrentUser } from "@/lib/auth";
import { loadCutterDataset } from "@/lib/cutter-data";
import { computeAndUpdateManufacturingRisk } from "@/app/actions/production-actions";
import { CutterDashboard } from "./cutter-dashboard";

export default async function CutterPage() {
  // Refresh risk flags on every dashboard load
  await computeAndUpdateManufacturingRisk();

  const [data, user] = await Promise.all([
    loadCutterDataset(),
    getCurrentUser(),
  ]);

  return <CutterDashboard data={data} userName={user?.displayName} />;
}
