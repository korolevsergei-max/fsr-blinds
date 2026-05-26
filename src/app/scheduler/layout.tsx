import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, getLinkedSchedulerId, type AppUser } from "@/lib/auth";
import { loadSchedulerDataset, getUnreadNotificationCount } from "@/lib/server-data";
import type { AppDataset } from "@/lib/app-dataset";
import { AppDatasetClientShell } from "@/components/data/app-dataset-client-shell";
import { SchedulerNav } from "./scheduler-nav";
import SchedulerLoading from "./loading";

function emptyDataset(): AppDataset {
  return {
    clients: [],
    buildings: [],
    units: [],
    rooms: [],
    windows: [],
    installers: [],
    schedule: [],
    cutters: [],
    schedulers: [],
    manufacturingEscalations: [],
    postInstallIssues: [],
  };
}

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
  let schedulerId: string | null = null;
  try {
    schedulerId = await getLinkedSchedulerId(user.id);
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
              <SchedulerDataShell user={user} schedulerId={schedulerId}>
                {children}
              </SchedulerDataShell>
            </Suspense>
          </main>
        </div>
      </div>
      <SchedulerNav unreadNotifications={unreadCount} recipientId={schedulerId} />
    </>
  );
}

async function SchedulerDataShell({
  user,
  schedulerId,
  children,
}: {
  user: AppUser;
  schedulerId: string | null;
  children: React.ReactNode;
}) {
  // Stream the real dataset via Suspense — the outer <Suspense fallback={<SchedulerLoading />}>
  // shows the skeleton while this awaits, replacing the prior empty-then-client-refresh path.
  // Realtime, offline cache, and visibility refresh in AppDatasetClientShell are unchanged.
  let data = emptyDataset();
  let needsClientFallback = false;
  try {
    data = await loadSchedulerDataset(schedulerId);
  } catch (error) {
    console.error("Failed to load scheduler dataset:", error);
    needsClientFallback = true;
  }

  return (
    <AppDatasetClientShell
      initialData={data}
      user={user}
      linkedEntityId={schedulerId}
      portalDataLoader="scheduler"
      eagerRefreshOnMount={needsClientFallback}
    >
      {children}
    </AppDatasetClientShell>
  );
}
