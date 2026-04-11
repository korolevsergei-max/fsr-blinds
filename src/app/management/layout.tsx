import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, type AppUser } from "@/lib/auth";
import { loadFullDataset } from "@/lib/server-data";
import type { AppDataset } from "@/lib/app-dataset";
import { AppDatasetClientShell } from "@/components/data/app-dataset-client-shell";
import { ManagementNav } from "./management-nav";
import ManagementLoading from "./loading";

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
  };
}

export default async function ManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role === "installer") {
    redirect("/installer");
  }
  if (user.role === "scheduler") {
    redirect("/scheduler");
  }
  if (user.role === "cutter") {
    redirect("/cutter");
  }
  if (user.role === "assembler") {
    redirect("/assembler");
  }
  if (user.role !== "owner") {
    redirect("/login");
  }

  return (
    <>
      <div className="min-h-[100dvh] bg-background">
        <div className="mx-auto max-w-lg min-h-[100dvh] pb-24 bg-card shadow-[0_0_0_1px_var(--border)]">
          <main id="main-content">
            <Suspense fallback={<ManagementLoading />}>
              <ManagementDataShell user={user}>{children}</ManagementDataShell>
            </Suspense>
          </main>
        </div>
      </div>
      <ManagementNav showAccounts={user.role === "owner"} />
    </>
  );
}

/** Async server component that fetches data, then wraps children in the client-side context. */
async function ManagementDataShell({
  user,
  children,
}: {
  user: AppUser;
  children: React.ReactNode;
}) {
  let data = emptyDataset();
  try {
    data = await loadFullDataset();
  } catch (error) {
    console.error("Failed to load management dataset:", error);
  }

  return (
    <AppDatasetClientShell
      initialData={data}
      user={user}
    >
      {children}
    </AppDatasetClientShell>
  );
}
