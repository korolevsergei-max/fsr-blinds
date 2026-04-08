import { notFound } from "next/navigation";
import { loadCutterUnitDetail } from "@/lib/cutter-data";
import { CutterUnitDetail } from "./cutter-unit-detail";

export default async function CutterUnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await loadCutterUnitDetail(id);
  if (!detail) notFound();
  return <CutterUnitDetail detail={detail} />;
}
