import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ManagementNav } from "./management-nav";

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
          <main id="main-content">{children}</main>
        </div>
      </div>
      <ManagementNav showAccounts={user.role === "owner"} />
    </>
  );
}
