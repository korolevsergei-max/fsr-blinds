import { ManufacturingProcessScreen } from "@/components/manufacturing/manufacturing-process-screen";
import { loadSchedulerManufacturingProcessRows } from "@/lib/manufacturing-process-server";

export default async function SchedulerProcessPage() {
  const rows = await loadSchedulerManufacturingProcessRows();

  return (
    <ManufacturingProcessScreen
      rows={rows}
      title="Manufacturing Process"
      backHref="/scheduler"
      unitHrefBase="/scheduler/units"
      hideClient
    />
  );
}
