import { loadCachedUnitMedia } from "@/lib/unit-route-data";
import { WindowStageReadonlyView } from "@/components/windows/window-stage-readonly-view";

export default async function ManagementWindowBeforePage({
  params,
}: {
  params: Promise<{ id: string; roomId: string }>;
}) {
  const { id } = await params;
  const mediaItems = await loadCachedUnitMedia(id);
  return <WindowStageReadonlyView mediaItems={mediaItems} mode="before" />;
}
