import { loadManufacturerDataset } from "@/lib/manufacturer-data";
import { ProductionQueue } from "./production-queue";

export default async function ManufacturerQueuePage() {
  const data = await loadManufacturerDataset();
  return <ProductionQueue units={data.units} />;
}
