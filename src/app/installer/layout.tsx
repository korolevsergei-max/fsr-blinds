import { redirect } from "next/navigation";
import { getCurrentUser, getLinkedInstallerId } from "@/lib/auth";
import { BottomNav } from "@/components/ui/bottom-nav";
import { getUnreadNotificationCount } from "@/lib/server-data";

export default async function InstallerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role === "owner" || user.role === "manufacturer") {
    redirect("/management");
  }
  if (user.role !== "installer") {
    redirect("/login");
  }

  let unreadCount = 0;
  try {
    const installerId = await getLinkedInstallerId(user.id);
    if (installerId) {
      unreadCount = await getUnreadNotificationCount("installer", installerId);
    }
  } catch {
    /* notifications table may not exist yet */
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-20">
      <div className="mx-auto max-w-lg min-h-[100dvh] bg-card shadow-[0_0_0_1px_var(--border)]">
        <main id="main-content">{children}</main>
      </div>
      <BottomNav unreadNotifications={unreadCount} />
    </div>
  );
}
