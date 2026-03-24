import { loadFullDataset } from "@/lib/server-data";
import { ClientsList } from "./clients-list";

export default async function ClientsPage() {
  const data = await loadFullDataset();
  return <ClientsList data={data} />;
}
