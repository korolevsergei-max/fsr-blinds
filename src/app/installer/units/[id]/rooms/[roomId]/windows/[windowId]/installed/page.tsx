import { loadCachedUnitMediaAndMilestones } from "@/lib/unit-route-data";
import { InstalledPhotoForm } from "@/components/windows/installed-photo-form";

export default async function InstallerInstalledPhotoPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string; windowId: string }>;
}) {
  const { id } = await params;
  const { mediaItems, milestones } = await loadCachedUnitMediaAndMilestones(id);
  return <InstalledPhotoForm mediaItems={mediaItems} milestones={milestones} />;
}
