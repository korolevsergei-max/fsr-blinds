import { loadFullDataset } from "@/lib/server-data";
import { UnitKeyDatesEditor } from "@/components/units/unit-key-dates-editor";

export default async function SchedulerUnitDatesPage() {
  const data = await loadFullDataset();
  return <UnitKeyDatesEditor data={data} unitsBasePath="/scheduler/units" />;
}
