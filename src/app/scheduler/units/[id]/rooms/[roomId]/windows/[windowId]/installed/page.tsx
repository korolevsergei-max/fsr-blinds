import { loadFullDataset, loadUnitStageMedia } from "@/lib/server-data";
import { WindowStageReadonlyView } from "@/components/windows/window-stage-readonly-view";

export default async function SchedulerWindowInstalledPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, mediaItems] = await Promise.all([
    loadFullDataset(),
    loadUnitStageMedia(id),
  ]);
  return (
    <WindowStageReadonlyView
      data={data}
      mediaItems={mediaItems}
      mode="installed"
      routeBasePath="/scheduler/units"
    />
  );
}
