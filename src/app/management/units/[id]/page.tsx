import { loadFullDataset, loadUnitActivityLog, loadUnitStageMedia } from "@/lib/server-data";
import { getUnitMilestoneCoverage } from "@/lib/unit-milestones";
import { getCurrentUser } from "@/lib/auth";
import { ManagementUnitDetail } from "./management-unit-detail";

export default async function ManagementUnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, activityLog, mediaItems, milestones, user] = await Promise.all([
    loadFullDataset(),
    loadUnitActivityLog(id),
    loadUnitStageMedia(id),
    getUnitMilestoneCoverage(id),
    getCurrentUser(),
  ]);
  return (
    <ManagementUnitDetail
      data={data}
      activityLog={activityLog}
      mediaItems={mediaItems}
      milestones={milestones}
      userRole={user?.role}
    />
  );
}
