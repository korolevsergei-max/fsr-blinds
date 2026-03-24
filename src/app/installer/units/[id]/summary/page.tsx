import { loadFullDataset } from "@/lib/server-data";
import { SummaryView } from "./summary-view";

export default async function SummaryPage() {
  const data = await loadFullDataset();
  return <SummaryView data={data} />;
}
