import { loadFullDataset } from "@/lib/server-data";
import { getCurrentUser } from "@/lib/auth";
import { ClientDetail } from "./client-detail";

export default async function ClientDetailPage() {
  const data = await loadFullDataset();
  const user = await getCurrentUser();
  return <ClientDetail data={data} userRole={user?.role} />;
}
