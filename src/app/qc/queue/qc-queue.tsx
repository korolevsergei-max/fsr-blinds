"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, Hourglass, CalendarBlank } from "@phosphor-icons/react";
import type { QCUnit } from "@/lib/qc-data";

function UnitRow({ unit }: { unit: QCUnit }) {
  const router = useRouter();
  const allBuilt = unit.builtCount >= unit.windowCount && unit.windowCount > 0;
  const borderColor = allBuilt ? "border-green-200" : "border-border";

  return (
    <button
      onClick={() => router.push(`/qc/units/${unit.id}`)}
      className={`w-full text-left rounded-xl border ${borderColor} bg-card px-4 py-3.5 space-y-1.5 active:opacity-70 transition-opacity hover:bg-muted/30`}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm text-primary">
          Unit {unit.unitNumber}
        </span>
        {allBuilt ? (
          <span className="text-xs font-semibold text-green-600 flex items-center gap-1">
            <CheckCircle size={13} weight="fill" />
            Ready for QC
          </span>
        ) : (
          <span className="text-xs text-yellow-600 flex items-center gap-1">
            <Hourglass size={13} weight="fill" />
            Partially built
          </span>
        )}
      </div>
      <p className="text-xs text-secondary">
        {unit.buildingName} · {unit.clientName}
      </p>
      <div className="flex items-center justify-between pt-0.5">
        <span className="text-xs text-tertiary">
          {unit.builtCount}/{unit.windowCount} built · {unit.qcApprovedCount} QC&apos;d
        </span>
        {unit.installationDate && (
          <span className="text-xs text-tertiary flex items-center gap-1">
            <CalendarBlank size={12} />
            {unit.installationDate}
          </span>
        )}
      </div>
    </button>
  );
}

export function QCQueue({ units }: { units: QCUnit[] }) {
  const router = useRouter();

  const readyForQC = units.filter((u) => u.builtCount >= u.windowCount && u.windowCount > 0);
  const partial = units.filter((u) => u.builtCount > 0 && u.builtCount < u.windowCount);

  return (
    <div className="px-4 pt-4 pb-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-tertiary"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-primary">QC Queue</h1>
          <p className="text-xs text-tertiary">
            {units.length} unit{units.length !== 1 ? "s" : ""} pending review
          </p>
        </div>
      </div>

      {units.length === 0 ? (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-10 text-center">
          <p className="text-sm font-medium text-primary">Nothing to review</p>
          <p className="text-xs text-tertiary mt-1">
            Units appear here once the manufacturer marks windows as built.
          </p>
        </div>
      ) : (
        <>
          {readyForQC.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <CheckCircle size={14} weight="fill" className="text-green-500" />
                <span className="text-xs font-semibold text-secondary uppercase tracking-wider">
                  Ready for QC
                </span>
                <span className="ml-auto text-xs text-tertiary">{readyForQC.length}</span>
              </div>
              {readyForQC.map((u) => (
                <UnitRow key={u.id} unit={u} />
              ))}
            </div>
          )}
          {partial.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Hourglass size={14} weight="fill" className="text-yellow-500" />
                <span className="text-xs font-semibold text-secondary uppercase tracking-wider">
                  Partially Built
                </span>
                <span className="ml-auto text-xs text-tertiary">{partial.length}</span>
              </div>
              {partial.map((u) => (
                <UnitRow key={u.id} unit={u} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
