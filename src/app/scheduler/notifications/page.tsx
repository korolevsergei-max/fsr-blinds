import { loadNotifications } from "@/lib/server-data";
import { getCurrentUser, getLinkedSchedulerId } from "@/lib/auth";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { SCHEDULER_NOTIF_CATEGORIES } from "@/lib/notification-types";

export default async function SchedulerNotificationsPage() {
  const user = await getCurrentUser();
  const schedulerId = user ? await getLinkedSchedulerId(user.id) : null;
  const recipientId = schedulerId ?? "";

  const notifications = recipientId
    ? await loadNotifications("scheduler", recipientId)
    : [];

  return (
    <NotificationsList
      notifications={notifications}
      recipientId={recipientId}
      recipientRole="scheduler"
      categories={SCHEDULER_NOTIF_CATEGORIES}
      unitBasePath="/scheduler/units"
    />
  );
}
