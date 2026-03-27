import { loadFullDataset, loadUnitStageMedia } from "@/lib/server-data";
import { StatusUpdate } from "./status-update";

export default async function StatusUpdatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, mediaItems] = await Promise.all([
    loadFullDataset(),
    loadUnitStageMedia(id),
  ]);
  return <StatusUpdate data={data} mediaItems={mediaItems} />;
}
