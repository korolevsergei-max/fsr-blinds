import { loadFullDataset, loadUnitStageMedia } from "@/lib/server-data";
import { InstalledPhotoForm } from "./installed-photo-form";

export default async function InstalledPhotoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, mediaItems] = await Promise.all([
    loadFullDataset(),
    loadUnitStageMedia(id),
  ]);

  return <InstalledPhotoForm data={data} mediaItems={mediaItems} />;
}
