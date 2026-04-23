import { ManufacturingProcessScreen } from "@/components/manufacturing/manufacturing-process-screen";
import { loadAssemblerManufacturingProcessRows } from "@/lib/manufacturing-process-server";

export default async function AssemblerProcessPage() {
  const rows = await loadAssemblerManufacturingProcessRows();

  return (
    <ManufacturingProcessScreen
      rows={rows}
      title="Manufacturing Process"
      backHref="/assembler"
      unitHrefBase="/assembler/units"
      hideClient
    />
  );
}
