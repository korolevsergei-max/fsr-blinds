import { loadSchedulerDataset } from "@/lib/server-data";
import { SummaryView } from "./summary-view";

export default async function SummaryPage() {
  const data = await loadSchedulerDataset();
  return <SummaryView data={data} />;
}
