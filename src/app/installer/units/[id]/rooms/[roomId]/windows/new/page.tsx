import { loadCachedUnitSupplementalData } from "@/lib/unit-route-data";
import { WindowForm } from "@/components/windows/window-form";

export default async function InstallerNewWindowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  const { activityLog, mediaItems, milestones } = await loadCachedUnitSupplementalData(id);
  const formKey = t ?? "default";

  return (
    <WindowForm key={formKey} activityLog={activityLog} mediaItems={mediaItems} milestones={milestones} />
  );
}
