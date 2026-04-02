import { loadFullDataset, loadUnitStageMedia } from "@/lib/server-data";
import { PostBracketingPhotoForm } from "@/components/windows/post-bracketing-photo-form";

export default async function SchedulerWindowBracketedPage({
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
    <PostBracketingPhotoForm
      data={data}
      mediaItems={mediaItems}
      routeBasePath="/scheduler/units"
    />
  );
}
