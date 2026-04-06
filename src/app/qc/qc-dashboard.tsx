"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { SignOut, CheckSquare, CheckCircle, Hourglass } from "@phosphor-icons/react";
import { signOut } from "@/app/actions/auth-actions";
import type { QCUnit } from "@/lib/qc-data";

export function QCDashboard({
  data,
  userName,
}: {
  data: { units: QCUnit[] };
  userName?: string;
}) {
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();
  const { units } = data;

  const readyForQC = units.filter((u) => u.builtCount >= u.windowCount && u.windowCount > 0);
  const partiallyBuilt = units.filter((u) => u.builtCount > 0 && u.builtCount < u.windowCount);

  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-tertiary uppercase tracking-widest font-medium mb-1">QC</p>
          <h1 className="text-xl font-semibold text-primary">
            {userName ? `Hi, ${userName.split(" ")[0]}` : "Quality Control"}
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
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-green-100 bg-green-50 px-3 py-3 flex flex-col gap-1">
          <CheckCircle size={18} weight="fill" className="text-green-500" />
          <span className="text-2xl font-bold text-green-700">{readyForQC.length}</span>
          <span className="text-[10px] text-tertiary">Ready for QC</span>
        </div>
        <div className="rounded-xl border border-yellow-100 bg-yellow-50 px-3 py-3 flex flex-col gap-1">
          <Hourglass size={18} weight="fill" className="text-yellow-500" />
          <span className="text-2xl font-bold text-yellow-700">{partiallyBuilt.length}</span>
          <span className="text-[10px] text-tertiary">Partially Built</span>
        </div>
      </div>

      {/* Quick access */}
      <button
        onClick={() => router.push("/qc/queue")}
        className="w-full flex items-center justify-between px-4 py-3 bg-accent text-white rounded-xl font-medium text-sm active:opacity-80 transition-opacity"
      >
        <span className="flex items-center gap-2">
          <CheckSquare size={18} />
          Open QC Queue
        </span>
        <span className="text-white/80">{units.length} unit{units.length !== 1 ? "s" : ""}</span>
      </button>

      {/* Ready for QC */}
      {readyForQC.length > 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-green-700 flex items-center gap-1.5">
            <CheckCircle size={16} weight="fill" />
            {readyForQC.length} unit{readyForQC.length !== 1 ? "s" : ""} ready for QC sign-off
          </p>
          <div className="mt-2 space-y-1">
            {readyForQC.slice(0, 3).map((u) => (
              <button
                key={u.id}
                onClick={() => router.push(`/qc/units/${u.id}`)}
                className="w-full text-left text-xs text-green-700 font-medium hover:underline"
              >
                Unit {u.unitNumber} — {u.buildingName}
                <span className="font-normal text-green-600 ml-1">
                  ({u.windowCount} window{u.windowCount !== 1 ? "s" : ""})
                </span>
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
          <p className="text-sm font-medium text-primary">Nothing to review</p>
          <p className="text-xs text-tertiary mt-1">Units will appear here once the manufacturer marks windows as built.</p>
        </div>
      )}
    </div>
  );
}
