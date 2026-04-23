import { ManufacturingProcessScreen } from "@/components/manufacturing/manufacturing-process-screen";
import { loadCutterManufacturingProcessRows } from "@/lib/manufacturing-process-server";

export default async function CutterProcessPage() {
  const rows = await loadCutterManufacturingProcessRows();

  return (
    <ManufacturingProcessScreen
      rows={rows}
      title="Manufacturing Process"
      backHref="/cutter"
      unitHrefBase="/cutter/units"
      hideClient
    />
  );
}
