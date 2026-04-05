import { Suspense } from "react";
import { loadSchedulerDataset, loadUnitActivityLog } from "@/lib/server-data";
import { WindowForm } from "@/components/windows/window-form";

export default async function NewWindowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, activityLog] = await Promise.all([
    loadSchedulerDataset(),
    loadUnitActivityLog(id),
  ]);
  return (
    <Suspense
      fallback={
        <div className="p-6 text-center text-muted text-sm">Loading form…</div>
      }
    >
      <WindowForm
        data={data}
        activityLog={activityLog}
        routeBasePath="/scheduler/units"
      />
    </Suspense>
  );
}
