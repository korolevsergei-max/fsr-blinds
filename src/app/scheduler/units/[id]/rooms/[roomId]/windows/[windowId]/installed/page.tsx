"use client";

import { useParams } from "next/navigation";
import { useUnitMediaAndMilestones } from "@/lib/use-unit-supplemental";
import { InstalledPhotoForm } from "@/components/windows/installed-photo-form";

export default function SchedulerInstalledPhotoPage() {
  const { id } = useParams<{ id: string }>();
  const { mediaItems, milestones } = useUnitMediaAndMilestones(id);
  return <InstalledPhotoForm mediaItems={mediaItems} milestones={milestones} routeBasePath="/scheduler/units" />;
}
