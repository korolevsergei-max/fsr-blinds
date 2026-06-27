import { loadOwnerDashboardCounts } from "@/lib/server-data";
import { ManagementPageClient } from "./management-page-client";

export default async function ManagementPage() {
  const initialCounts = await loadOwnerDashboardCounts();
  return <ManagementPageClient initialCounts={initialCounts} />;
}
