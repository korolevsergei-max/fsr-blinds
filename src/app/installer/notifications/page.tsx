import { loadNotifications } from "@/lib/server-data";
import { getCurrentUser, getLinkedInstallerId } from "@/lib/auth";
import { NotificationsList } from "./notifications-list";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  const installerId = user ? await getLinkedInstallerId(user.id) : null;
  const recipientId = installerId ?? "inst-1";
  const notifications = await loadNotifications("installer", recipientId);
  return <NotificationsList notifications={notifications} installerId={recipientId} />;
}
