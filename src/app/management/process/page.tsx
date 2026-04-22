import { ManufacturingProcessScreen } from "@/components/manufacturing/manufacturing-process-screen";
import { loadOwnerManufacturingProcessRows } from "@/lib/manufacturing-process-server";

export default async function ManagementProcessPage() {
  const rows = await loadOwnerManufacturingProcessRows();

  return (
    <ManufacturingProcessScreen
      rows={rows}
      title="Manufacturing Process"
      backHref="/management"
      unitHrefBase="/management/units"
    />
  );
}
