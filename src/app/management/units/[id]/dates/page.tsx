import { loadUnitDetail } from "@/lib/server-data";
import { UnitKeyDatesEditor } from "@/components/units/unit-key-dates-editor";

export default async function ManagementUnitDatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadUnitDetail(id);
  return <UnitKeyDatesEditor data={data} unitsBasePath="/management/units" showCompleteBy />;
}
