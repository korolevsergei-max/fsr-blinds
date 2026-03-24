import { loadNotifications } from "@/lib/server-data";
import { NotificationsList } from "./notifications-list";

export default async function NotificationsPage() {
  const notifications = await loadNotifications("installer", "inst-1");
  return <NotificationsList notifications={notifications} />;
}
