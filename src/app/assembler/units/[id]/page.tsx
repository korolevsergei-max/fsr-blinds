import { notFound } from "next/navigation";
import { loadAssemblerUnitDetail } from "@/lib/assembler-data";
import { AssemblerUnitDetail } from "./assembler-unit-detail";

export default async function AssemblerUnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await loadAssemblerUnitDetail(id);
  if (!detail) notFound();
  return <AssemblerUnitDetail detail={detail} />;
}
