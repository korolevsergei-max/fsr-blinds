import { loadFullDataset } from "@/lib/server-data";
import { StatusGridReport } from "./status-grid-report";

export const metadata = {
  title: "Reports | FSR Blinds",
  description: "Status grid report for tracking unit progress by building and floor.",
};

export default async function ReportsPage() {
  const data = await loadFullDataset();
  return <StatusGridReport units={data.units} clients={data.clients} buildings={data.buildings} />;
}
