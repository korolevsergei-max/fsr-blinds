import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SchedulerNav } from "./scheduler-nav";

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
  if (user.role === "manufacturer") {
    redirect("/manufacturer");
  }
  if (user.role === "installer") {
    redirect("/installer");
  }
  if (user.role !== "scheduler") {
    redirect("/login");
  }

  return (
    <>
      <div className="min-h-[100dvh] bg-background">
        <div className="mx-auto max-w-lg min-h-[100dvh] pb-24 bg-card shadow-[0_0_0_1px_var(--border)]">
          <main id="main-content">{children}</main>
        </div>
      </div>
      <SchedulerNav />
    </>
  );
}
