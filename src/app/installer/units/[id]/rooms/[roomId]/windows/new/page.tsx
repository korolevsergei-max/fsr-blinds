import { Suspense } from "react";
import { loadFullDataset, loadUnitActivityLog } from "@/lib/server-data";
import { WindowForm } from "./window-form";

export default async function NewWindowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, activityLog] = await Promise.all([
    loadFullDataset(),
    loadUnitActivityLog(id),
  ]);
  return (
    <Suspense
      fallback={
        <div className="p-6 text-center text-muted text-sm">Loading form…</div>
      }
    >
      <WindowForm data={data} activityLog={activityLog} />
    </Suspense>
  );
}
