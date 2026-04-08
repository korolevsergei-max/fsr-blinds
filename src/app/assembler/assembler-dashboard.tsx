"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { SignOut, Wrench, CheckCircle, Hourglass } from "@phosphor-icons/react";
import { signOut } from "@/app/actions/auth-actions";
import type { AssemblerUnit } from "@/lib/assembler-data";

export function AssemblerDashboard({
  data,
  userName,
}: {
  data: { units: AssemblerUnit[] };
  userName?: string;
}) {
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();
  const { units } = data;

  // Units where all windows are cut (ready for assembly)
  const readyForAssembly = units.filter(
    (u) => u.cutCount >= u.windowCount && u.assembledCount < u.windowCount && u.windowCount > 0
  );
  // Units with some cut windows but not all
  const partiallyCut = units.filter(
    (u) => u.cutCount > 0 && u.cutCount < u.windowCount
  );
  // Units with assembled windows ready for QC
  const readyForQC = units.filter(
    (u) => u.assembledCount > u.qcApprovedCount && u.assembledCount > 0
  );

  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-tertiary uppercase tracking-widest font-medium mb-1">Assembly &amp; QC</p>
          <h1 className="text-xl font-semibold text-primary">
            {userName ? `Hi, ${userName.split(" ")[0]}` : "Assembly & QC"}
          </h1>
        </div>
        <button
          onClick={() => startSignOut(async () => { await signOut(); })}
          disabled={signingOut}
          className="flex items-center gap-1.5 text-xs text-tertiary hover:text-secondary transition-colors px-2 py-1.5 rounded-md hover:bg-muted"
        >
          <SignOut size={14} />
          Sign out
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 flex flex-col gap-1">
          <Wrench size={18} weight="fill" className="text-blue-500" />
          <span className="text-2xl font-bold text-blue-700">{readyForAssembly.length}</span>
          <span className="text-[10px] text-tertiary leading-tight">Ready to Assemble</span>
        </div>
        <div className="rounded-xl border border-yellow-100 bg-yellow-50 px-3 py-3 flex flex-col gap-1">
          <Hourglass size={18} weight="fill" className="text-yellow-500" />
          <span className="text-2xl font-bold text-yellow-700">{partiallyCut.length}</span>
          <span className="text-[10px] text-tertiary leading-tight">Partially Cut</span>
        </div>
        <div className="rounded-xl border border-green-100 bg-green-50 px-3 py-3 flex flex-col gap-1">
          <CheckCircle size={18} weight="fill" className="text-green-500" />
          <span className="text-2xl font-bold text-green-700">{readyForQC.length}</span>
          <span className="text-[10px] text-tertiary leading-tight">Ready for QC</span>
        </div>
      </div>

      {/* Quick access */}
      <button
        onClick={() => router.push("/assembler/queue")}
        className="w-full flex items-center justify-between px-4 py-3 bg-accent text-white rounded-xl font-medium text-sm active:opacity-80 transition-opacity"
      >
        <span className="flex items-center gap-2">
          <Wrench size={18} />
          Open Assembly Queue
        </span>
        <span className="text-white/80">{units.length} unit{units.length !== 1 ? "s" : ""}</span>
      </button>

      {/* Ready for assembly */}
      {readyForAssembly.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-blue-700 flex items-center gap-1.5">
            <Wrench size={16} weight="fill" />
            {readyForAssembly.length} unit{readyForAssembly.length !== 1 ? "s" : ""} fully cut &mdash; ready to assemble
          </p>
          <div className="mt-2 space-y-1">
            {readyForAssembly.slice(0, 3).map((u) => (
              <button
                key={u.id}
                onClick={() => router.push(`/assembler/units/${u.id}`)}
                className="w-full text-left text-xs text-blue-700 font-medium hover:underline"
              >
                Unit {u.unitNumber} &mdash; {u.buildingName}
                <span className="font-normal text-blue-600 ml-1">
                  ({u.windowCount} window{u.windowCount !== 1 ? "s" : ""})
                </span>
              </button>
            ))}
            {readyForAssembly.length > 3 && (
              <p className="text-xs text-blue-500">+{readyForAssembly.length - 3} more</p>
            )}
          </div>
        </div>
      )}

      {/* Ready for QC */}
      {readyForQC.length > 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-green-700 flex items-center gap-1.5">
            <CheckCircle size={16} weight="fill" />
            {readyForQC.length} unit{readyForQC.length !== 1 ? "s" : ""} assembled &mdash; ready for QC sign-off
          </p>
          <div className="mt-2 space-y-1">
            {readyForQC.slice(0, 3).map((u) => (
              <button
                key={u.id}
                onClick={() => router.push(`/assembler/units/${u.id}`)}
                className="w-full text-left text-xs text-green-700 font-medium hover:underline"
              >
                Unit {u.unitNumber} &mdash; {u.buildingName}
              </button>
            ))}
            {readyForQC.length > 3 && (
              <p className="text-xs text-green-500">+{readyForQC.length - 3} more</p>
            )}
          </div>
        </div>
      )}

      {units.length === 0 && (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-8 text-center">
          <CheckCircle size={32} className="mx-auto mb-2 text-tertiary" weight="regular" />
          <p className="text-sm font-medium text-primary">Nothing to assemble</p>
          <p className="text-xs text-tertiary mt-1">Units will appear here once the cutter marks windows as cut.</p>
        </div>
      )}
    </div>
  );
}
