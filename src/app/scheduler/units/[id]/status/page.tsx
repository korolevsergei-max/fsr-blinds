import { loadFullDataset, loadUnitStageMedia } from "@/lib/server-data";
import { UnitStatusEditor } from "@/components/units/unit-status-editor";

export default async function SchedulerStatusPage({
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
    <UnitStatusEditor
      data={data}
      mediaItems={mediaItems}
      unitsBasePath="/scheduler/units"
    />
  );
}
