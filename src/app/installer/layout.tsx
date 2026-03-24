import { BottomNav } from "@/components/ui/bottom-nav";
import { getUnreadNotificationCount } from "@/lib/server-data";

export default async function InstallerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let unreadCount = 0;
  try {
    unreadCount = await getUnreadNotificationCount("installer", "inst-1");
  } catch {
    /* notifications table may not exist yet */
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-20">
      <div className="mx-auto max-w-lg min-h-[100dvh] bg-white shadow-sm">
        {children}
      </div>
      <BottomNav unreadNotifications={unreadCount} />
    </div>
  );
}
