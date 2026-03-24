import { loadFullDataset } from "@/lib/server-data";
import { ClientDetail } from "./client-detail";

export default async function ClientDetailPage() {
  const data = await loadFullDataset();
  return <ClientDetail data={data} />;
}
