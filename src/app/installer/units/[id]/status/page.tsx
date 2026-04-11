import { loadCachedUnitMilestones } from "@/lib/unit-route-data";
import { StatusUpdate } from "./status-update";

export default async function InstallerStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const milestones = await loadCachedUnitMilestones(id);
  return <StatusUpdate milestones={milestones} />;
}
