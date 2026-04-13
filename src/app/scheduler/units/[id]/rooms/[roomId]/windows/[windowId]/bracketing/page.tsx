"use client";

import { useParams } from "next/navigation";
import { useUnitMediaAndMilestones } from "@/lib/use-unit-supplemental";
import { PostBracketingPhotoForm } from "@/components/windows/post-bracketing-photo-form";

export default function SchedulerPostBracketingPhotoPage() {
  const { id } = useParams<{ id: string }>();
  const { mediaItems, milestones } = useUnitMediaAndMilestones(id);
  return <PostBracketingPhotoForm mediaItems={mediaItems} milestones={milestones} routeBasePath="/scheduler/units" />;
}
