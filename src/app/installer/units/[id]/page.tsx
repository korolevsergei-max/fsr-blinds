import { loadUnitDetail, loadUnitActivityLog, loadUnitStageMedia } from "@/lib/server-data";
import { getUnitMilestoneCoverage } from "@/lib/unit-milestones";
import { recomputeUnitStatus } from "@/lib/unit-progress";
import { createClient } from "@/lib/supabase/server";
import { UnitDetail } from "./unit-detail";

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Self-heal stale unit status in DB so list views also reflect accurate state
  const supabase = await createClient();
  await recomputeUnitStatus(supabase, id);
  const [data, mediaItems, activityLog, milestones] = await Promise.all([
    loadUnitDetail(id),
    loadUnitStageMedia(id),
    loadUnitActivityLog(id),
    getUnitMilestoneCoverage(id),
  ]);
  return <UnitDetail data={data} mediaItems={mediaItems} activityLog={activityLog} milestones={milestones} />;
}
