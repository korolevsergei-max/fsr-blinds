import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, getLinkedSchedulerId, type AppUser } from "@/lib/auth";
import { loadSchedulerDataset, getUnreadNotificationCount } from "@/lib/server-data";
import { AppDatasetClientShell } from "@/components/data/app-dataset-client-shell";
import { SchedulerNav } from "./scheduler-nav";
import SchedulerLoading from "./loading";

export default async function SchedulerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role === "owner") {
    redirect("/management");
  }
  if (user.role === "cutter") {
    redirect("/cutter");
  }
  if (user.role === "installer") {
    redirect("/installer");
  }
  if (user.role !== "scheduler") {
    redirect("/login");
  }

  let unreadCount = 0;
  try {
    const schedulerId = await getLinkedSchedulerId(user.id);
    if (schedulerId) {
      unreadCount = await getUnreadNotificationCount("scheduler", schedulerId);
    }
  } catch {
    /* notifications table may not exist yet */
  }

  return (
    <>
      <div className="min-h-[100dvh] bg-background">
        <div className="mx-auto max-w-lg min-h-[100dvh] pb-24 bg-card shadow-[0_0_0_1px_var(--border)]">
          <main id="main-content">
            <Suspense fallback={<SchedulerLoading />}>
              <SchedulerDataShell user={user}>{children}</SchedulerDataShell>
            </Suspense>
          </main>
        </div>
      </div>
      <SchedulerNav unreadNotifications={unreadCount} />
    </>
  );
}

async function SchedulerDataShell({
  user,
  children,
}: {
  user: AppUser;
  children: React.ReactNode;
}) {
  const schedulerId = await getLinkedSchedulerId(user.id);
  const data = await loadSchedulerDataset();

  return (
    <AppDatasetClientShell
      initialData={data}
      user={user}
      linkedEntityId={schedulerId}
      portalDataLoader="scheduler"
    >
      {children}
    </AppDatasetClientShell>
  );
}
