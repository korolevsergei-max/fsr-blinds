import { getCurrentUser } from "@/lib/auth";
import { loadManufacturerDataset } from "@/lib/manufacturer-data";
import { computeAndUpdateManufacturingRisk } from "@/app/actions/manufacturer-actions";
import { ManufacturerDashboard } from "./manufacturer-dashboard";

export default async function ManufacturerPage() {
  // Refresh risk flags on every dashboard load
  await computeAndUpdateManufacturingRisk();

  const [data, user] = await Promise.all([
    loadManufacturerDataset(),
    getCurrentUser(),
  ]);

  return <ManufacturerDashboard data={data} userName={user?.displayName} />;
}
