import { loadQCDataset } from "@/lib/qc-data";
import { QCQueue } from "./qc-queue";

export default async function QCQueuePage() {
  const data = await loadQCDataset();
  return <QCQueue units={data.units} />;
}
