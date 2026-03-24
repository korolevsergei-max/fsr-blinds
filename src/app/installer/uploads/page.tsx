import { PageHeader } from "@/components/ui/page-header";
import { loadInstallerMedia } from "@/lib/server-data";
import { UploadsEmpty, UploadsGallery } from "./uploads-gallery";

const DEMO_INSTALLER_ID = "inst-1";

export default async function UploadsPage() {
  let items: Awaited<ReturnType<typeof loadInstallerMedia>> = [];
  let loadError: string | null = null;
  try {
    items = await loadInstallerMedia(DEMO_INSTALLER_ID);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load uploads";
  }

  return (
    <div className="flex flex-col">
      <PageHeader title="Uploads" subtitle="Photos from your assigned units" />
      {loadError ? (
        <p className="px-4 py-6 text-sm text-red-600 text-center">{loadError}</p>
      ) : items.length === 0 ? (
        <UploadsEmpty />
      ) : (
        <UploadsGallery items={items} />
      )}
    </div>
  );
}
