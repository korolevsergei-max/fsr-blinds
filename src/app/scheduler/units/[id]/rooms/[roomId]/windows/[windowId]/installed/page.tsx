import { loadCachedUnitMedia } from "@/lib/unit-route-data";
import { InstalledPhotoForm } from "@/components/windows/installed-photo-form";

export default async function SchedulerInstalledPhotoPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string; windowId: string }>;
}) {
  const { id } = await params;
  const mediaItems = await loadCachedUnitMedia(id);
  return <InstalledPhotoForm mediaItems={mediaItems} routeBasePath="/scheduler/units" />;
}
