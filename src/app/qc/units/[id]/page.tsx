import { notFound } from "next/navigation";
import { loadQCUnitDetail } from "@/lib/qc-data";
import { QCUnitDetail } from "./qc-unit-detail";

export default async function QCUnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await loadQCUnitDetail(id);
  if (!detail) notFound();
  return <QCUnitDetail detail={detail} />;
}
