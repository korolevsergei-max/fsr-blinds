import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, getLinkedInstallerId, type AppUser } from "@/lib/auth";
import { loadInstallerDataset, getUnreadNotificationCount } from "@/lib/server-data";
import { AppDatasetClientShell } from "@/components/data/app-dataset-client-shell";
import { BottomNav } from "@/components/ui/bottom-nav";
import InstallerLoading from "./loading";

export default async function InstallerLayout({
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
  if (user.role === "assembler") {
    redirect("/assembler");
  }
  if (user.role !== "installer") {
    redirect("/login");
  }

  let unreadCount = 0;
  let installerId: string | null = null;
  try {
    installerId = await getLinkedInstallerId(user.id);
    if (installerId) {
      unreadCount = await getUnreadNotificationCount("installer", installerId);
    }
  } catch {
    /* notifications table may not exist yet */
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-20">
      <div className="mx-auto max-w-lg min-h-[100dvh] bg-card shadow-[0_0_0_1px_var(--border)]">
        <main id="main-content">
          <Suspense fallback={<InstallerLoading />}>
            <InstallerDataShell user={user}>{children}</InstallerDataShell>
          </Suspense>
        </main>
      </div>
      <BottomNav unreadNotifications={unreadCount} recipientId={installerId} />
    </div>
  );
}

async function InstallerDataShell({
  user,
  children,
}: {
  user: AppUser;
  children: React.ReactNode;
}) {
  const installerId = await getLinkedInstallerId(user.id);
  const data = await loadInstallerDataset(installerId ?? "");

  return (
    <AppDatasetClientShell
      initialData={data}
      user={user}
      linkedEntityId={installerId}
      portalDataLoader="installer"
    >
      {children}
    </AppDatasetClientShell>
  );
}
