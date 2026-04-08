import { loadNotifications } from "@/lib/server-data";
import { getCurrentUser, getLinkedInstallerId } from "@/lib/auth";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { INSTALLER_NOTIF_CATEGORIES } from "@/lib/notification-types";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  const installerId = user ? await getLinkedInstallerId(user.id) : null;
  const recipientId = installerId ?? "inst-1";
  const notifications = await loadNotifications("installer", recipientId);

  return (
    <NotificationsList
      notifications={notifications}
      recipientId={recipientId}
      recipientRole="installer"
      categories={INSTALLER_NOTIF_CATEGORIES}
      unitBasePath="/installer/units"
    />
  );
}
