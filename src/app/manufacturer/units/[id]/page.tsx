import { notFound } from "next/navigation";
import { loadManufacturerUnitDetail } from "@/lib/manufacturer-data";
import { ManufacturerUnitDetail } from "./manufacturer-unit-detail";

export default async function ManufacturerUnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await loadManufacturerUnitDetail(id);
  if (!detail) notFound();
  return <ManufacturerUnitDetail detail={detail} />;
}
