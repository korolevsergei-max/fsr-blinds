import { loadSchedulerDataset } from "@/lib/server-data";
import { UnitKeyDatesEditor } from "@/components/units/unit-key-dates-editor";

export default async function SchedulerUnitDatesPage() {
  const data = await loadSchedulerDataset();
  return <UnitKeyDatesEditor data={data} unitsBasePath="/scheduler/units" />;
}
