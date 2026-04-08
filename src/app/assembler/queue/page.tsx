import { loadAssemblerDataset } from "@/lib/assembler-data";
import { AssemblerQueue } from "./assembler-queue";

export default async function AssemblerQueuePage() {
  const data = await loadAssemblerDataset();
  return <AssemblerQueue units={data.units} />;
}
