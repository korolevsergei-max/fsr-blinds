import { loadAssemblerUnitDetail } from "@/lib/assembler-data";
import { QcUnitDetail } from "./qc-unit-detail";

export default async function QcUnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await loadAssemblerUnitDetail(id);
  if (!detail) return null;
  return <QcUnitDetail detail={detail} />;
}
