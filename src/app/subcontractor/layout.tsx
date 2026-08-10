import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SubcontractorNav } from "./subcontractor-nav";

/**
 * The one portal that is NOT mobile-shaped.
 *
 * Every other segment wraps its children in `mx-auto max-w-lg` — that single
 * class is what makes the app a phone app. Subcontractors work at a desk against
 * a wide spec table, so this layout deliberately omits it and gives the table the
 * full viewport. No existing portal is touched.
 */
export default async function SubcontractorLayout({
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
  if (user.role === "scheduler") {
    redirect("/scheduler");
  }
  if (user.role === "assembler") {
    redirect("/assembler");
  }
  if (user.role === "qc") {
    redirect("/qc");
  }
  if (user.role !== "subcontractor") {
    redirect("/login");
  }

  // Viewport-tall flex column, not a page that grows: the work table scrolls
  // inside its own pane so its header row can stay pinned while they read down a
  // 77-row list. `min-h-0` on the main is what lets that pane shrink instead of
  // pushing the document taller.
  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <SubcontractorNav displayName={user.displayName} />
      <main id="main-content" className="flex min-h-0 flex-1 flex-col px-4 py-5 sm:px-6">
        {children}
      </main>
    </div>
  );
}
