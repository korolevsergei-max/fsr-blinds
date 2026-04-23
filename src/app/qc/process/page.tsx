import { ManufacturingProcessScreen } from "@/components/manufacturing/manufacturing-process-screen";
import { loadQcManufacturingProcessRows } from "@/lib/manufacturing-process-server";

export default async function QcProcessPage() {
  const rows = await loadQcManufacturingProcessRows();

  return (
    <ManufacturingProcessScreen
      rows={rows}
      title="Manufacturing Process"
      backHref="/qc"
      unitHrefBase="/qc/units"
      hideClient
    />
  );
}
