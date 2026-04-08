import { loadCutterDataset } from "@/lib/cutter-data";
import { CuttingQueue } from "./cutting-queue";

export default async function CutterQueuePage() {
  const data = await loadCutterDataset();
  return <CuttingQueue units={data.units} />;
}
