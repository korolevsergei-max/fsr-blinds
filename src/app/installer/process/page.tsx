import { ManufacturingProcessScreen } from "@/components/manufacturing/manufacturing-process-screen";
import { loadInstallerManufacturingProcessRows } from "@/lib/manufacturing-process-server";

export default async function InstallerProcessPage() {
  const rows = await loadInstallerManufacturingProcessRows();

  return (
    <ManufacturingProcessScreen
      rows={rows}
      title="Manufacturing Process"
      backHref="/installer"
      unitHrefBase="/installer/units"
      hideClient
    />
  );
}
