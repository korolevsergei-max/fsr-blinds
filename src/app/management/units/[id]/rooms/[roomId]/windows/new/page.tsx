import { loadUnitDetail, loadUnitStageMedia } from "@/lib/server-data";
import { WindowStageReadonlyView } from "@/components/windows/window-stage-readonly-view";

export default async function ManagementWindowBeforePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, mediaItems] = await Promise.all([
    loadUnitDetail(id),
    loadUnitStageMedia(id),
  ]);
  return <WindowStageReadonlyView data={data} mediaItems={mediaItems} mode="before" />;
}
