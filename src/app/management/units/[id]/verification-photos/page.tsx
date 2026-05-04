import { loadOwnerVerificationPhotos } from "@/lib/owner-verification-server";
import { OwnerVerificationPhotosScreen } from "@/components/units/owner-verification-photos-screen";

export default async function ManagementUnitVerificationPhotosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const photos = await loadOwnerVerificationPhotos(id);

  return <OwnerVerificationPhotosScreen unitId={id} initialPhotos={photos} />;
}
