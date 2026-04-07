import { loadUnitDetail, loadUnitStageMedia } from "@/lib/server-data";
import { InstalledPhotoForm } from "@/components/windows/installed-photo-form";

export default async function InstalledPhotoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, mediaItems] = await Promise.all([
    loadUnitDetail(id),
    loadUnitStageMedia(id),
  ]);

  return <InstalledPhotoForm data={data} mediaItems={mediaItems} />;
}
