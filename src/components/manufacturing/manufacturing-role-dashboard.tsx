"use client";

import { useTransition } from "react";
import { SignOut } from "@phosphor-icons/react";
import { signOut } from "@/app/actions/auth-actions";

/**
 * Static chrome for a manufacturing role dashboard (greeting, headline, sign-out).
 * The data-heavy pipeline is passed as `children` so the page can wrap it in a
 * <Suspense> boundary — the header paints immediately while the persisted
 * schedule streams in behind a skeleton.
 */
export function ManufacturingRoleShell({
  role,
  userName,
  children,
}: {
  role: "cutter" | "assembler" | "qc";
  userName?: string;
  children: React.ReactNode;
}) {
  const [signingOut, startSignOut] = useTransition();

  const headline = role === "cutter" ? "Cutting" : role === "assembler" ? "Assembly" : "QC";
  const greeting =
    userName
      ? `Hello, ${userName.split(" ")[0]}`
      : role === "cutter"
        ? "Cutter"
        : role === "assembler"
          ? "Assembler"
          : "QC";

  return (
    <div className="space-y-5 px-4 pt-5 pb-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="mb-0.5 text-[12px] font-medium text-tertiary">{greeting}</p>
          <h1 className="text-[1.625rem] font-bold leading-none tracking-[-0.03em] text-foreground">
            {headline}
          </h1>
        </div>
        <button
          onClick={() => startSignOut(async () => { await signOut(); })}
          disabled={signingOut}
          className="flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1.5 text-[12px] font-medium text-tertiary transition-colors hover:bg-surface hover:text-secondary"
        >
          <SignOut size={14} />
          Sign out
        </button>
      </div>

      {children}
    </div>
  );
}
