import { loadCachedUnitMediaAndMilestones } from "@/lib/unit-route-data";
import { WindowStageReadonlyView } from "@/components/windows/window-stage-readonly-view";

export default async function ManagementWindowBeforePage({
  params,
}: {
  params: Promise<{ id: string; roomId: string }>;
}) {
  const { id } = await params;
  const { mediaItems, milestones } = await loadCachedUnitMediaAndMilestones(id);
  return <WindowStageReadonlyView mediaItems={mediaItems} milestones={milestones} mode="before" />;
}
