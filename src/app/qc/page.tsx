import { getCurrentUser } from "@/lib/auth";
import { loadQCDataset } from "@/lib/qc-data";
import { QCDashboard } from "./qc-dashboard";

export default async function QCPage() {
  const [data, user] = await Promise.all([loadQCDataset(), getCurrentUser()]);
  return <QCDashboard data={data} userName={user?.displayName} />;
}
