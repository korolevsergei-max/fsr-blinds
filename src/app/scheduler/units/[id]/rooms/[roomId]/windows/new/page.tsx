import { Suspense } from "react";
import { loadCachedUnitSupplementalData } from "@/lib/unit-route-data";
import { WindowForm } from "@/components/windows/window-form";

export default async function SchedulerNewWindowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; roomId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  const supplemental = await loadCachedUnitSupplementalData(id);
  const formKey = t ?? "default";

  return (
    <Suspense fallback={<div className="p-6 text-center text-muted text-sm">Loading form…</div>}>
      <WindowForm
        key={formKey}
        activityLog={supplemental.activityLog}
        routeBasePath="/scheduler/units"
      />
    </Suspense>
  );
}
