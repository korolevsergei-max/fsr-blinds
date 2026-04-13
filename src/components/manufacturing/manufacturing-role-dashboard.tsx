"use client";

import { useTransition } from "react";
import { SignOut } from "@phosphor-icons/react";
import type { ManufacturingRoleSchedule } from "@/lib/manufacturing-scheduler";
import { signOut } from "@/app/actions/auth-actions";
import { ManufacturingRolePipelineDashboard } from "@/components/manufacturing/manufacturing-role-pipeline-dashboard";

export function ManufacturingRoleDashboard({
  role,
  schedule,
  userName,
}: {
  role: "cutter" | "assembler" | "qc";
  schedule: ManufacturingRoleSchedule;
  userName?: string;
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

      <ManufacturingRolePipelineDashboard
        role={role}
        schedule={schedule}
        unitHrefBase={`/${role}/units`}
      />
    </div>
  );
}
