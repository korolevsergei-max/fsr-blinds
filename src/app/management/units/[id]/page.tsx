import { loadUnitDetail, loadUnitActivityLog, loadUnitStageMedia } from "@/lib/server-data";
import { getUnitMilestoneCoverage } from "@/lib/unit-milestones";
import { recomputeUnitStatus } from "@/lib/unit-progress";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { ManagementUnitDetail } from "./management-unit-detail";

export default async function ManagementUnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Self-heal stale unit status in DB so list views also reflect accurate state
  const supabase = await createClient();
  await recomputeUnitStatus(supabase, id);
  const [data, activityLog, mediaItems, milestones, user] = await Promise.all([
    loadUnitDetail(id),
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
