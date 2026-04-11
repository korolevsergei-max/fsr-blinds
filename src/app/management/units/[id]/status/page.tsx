import { loadCachedUnitMediaAndMilestones } from "@/lib/unit-route-data";
import { UnitStatusEditor } from "@/components/units/unit-status-editor";

export default async function ManagementStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { mediaItems, milestones } = await loadCachedUnitMediaAndMilestones(id);

  return (
    <UnitStatusEditor
      mediaItems={mediaItems}
      milestones={milestones}
      unitsBasePath="/management/units"
    />
  );
}
