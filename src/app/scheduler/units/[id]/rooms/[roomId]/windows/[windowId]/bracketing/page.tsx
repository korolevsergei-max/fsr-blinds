import { loadCachedUnitMediaAndMilestones } from "@/lib/unit-route-data";
import { PostBracketingPhotoForm } from "@/components/windows/post-bracketing-photo-form";

export default async function SchedulerPostBracketingPhotoPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string; windowId: string }>;
}) {
  const { id } = await params;
  const { mediaItems, milestones } = await loadCachedUnitMediaAndMilestones(id);
  return <PostBracketingPhotoForm mediaItems={mediaItems} milestones={milestones} routeBasePath="/scheduler/units" />;
}
