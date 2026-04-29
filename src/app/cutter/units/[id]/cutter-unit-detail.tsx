"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  Scissors,
  Ruler,
  Warning,
} from "@phosphor-icons/react";
import { markWindowCut } from "@/app/actions/production-actions";
import type { CutterUnitDetail as DetailType, CutterWindow } from "@/lib/cutter-data";
import { PRODUCTION_STATUS_LABELS } from "@/lib/types";
import { ManufacturingSummaryCard } from "@/components/windows/manufacturing-summary-card";

function formatDim(val: number | null): string {
  if (val === null) return "\u2014";
  return `${val}"`;
}

function WindowCard({ window: win, roomName, onCut }: { window: CutterWindow; roomName: string; onCut: (id: string) => void }) {
  const [pending, startTransition] = useTransition();
  const production = win.production;
  const status = production?.status ?? "pending";

  const statusColors: Record<string, string> = {
    pending: "bg-gray-100 text-gray-500 border-gray-200",
    cut: "bg-blue-50 text-blue-600 border-blue-200",
    assembled: "bg-purple-50 text-purple-600 border-purple-200",
    qc_approved: "bg-green-50 text-green-600 border-green-200",
  };

  const blindTypeLabel = win.blindType === "blackout" ? "Blackout" : "Screen";

  function handleMarkCut() {
    // Optimistic: update UI immediately
    onCut(win.id);
    // Fire DB write in background
    startTransition(async () => {
      await markWindowCut(win.id);
    });
  }

  return (
    <div className={`rounded-xl border px-4 py-3.5 space-y-2 ${statusColors[status] ?? statusColors.pending}`}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm text-primary">{win.label}</p>
          <p className="text-xs text-tertiary">{roomName}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {production?.manufacturingLabelPrintedAt && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-zinc-100 text-zinc-700 border-zinc-300">
              MFG ✓
            </span>
          )}
          {production?.packagingLabelPrintedAt && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
              PKG ✓
            </span>
          )}
          <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${statusColors[status] ?? statusColors.pending}`}>
            {PRODUCTION_STATUS_LABELS[status]}
          </span>
        </div>
      </div>

      {/* Specs */}
      <div className="flex items-center gap-3 text-xs text-secondary">
        <span className="flex items-center gap-1">
          <Ruler size={12} />
          {formatDim(win.width)} &times; {formatDim(win.height)}
          {win.depth !== null ? ` \u00d7 ${formatDim(win.depth)}` : ""}
        </span>
        <span className="px-1.5 py-0.5 bg-card border border-border rounded text-[10px] font-medium text-primary">
          {blindTypeLabel}
        </span>
      </div>

      {/* Notes */}
      {win.notes && (
        <p className="text-xs text-secondary flex items-start gap-1.5">
          <Warning size={12} className="mt-0.5 shrink-0 text-yellow-500" />
          {win.notes}
        </p>
      )}

      {/* Status info */}
      {status === "qc_approved" && production?.qcApprovedAt && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <CheckCircle size={12} weight="fill" />
          Built fully {new Date(production.qcApprovedAt).toLocaleDateString()}
        </p>
      )}
      {status === "cut" && production?.cutAt && (
        <p className="text-xs text-blue-500 flex items-center gap-1">
          <Scissors size={12} weight="fill" />
          Cut {new Date(production.cutAt).toLocaleDateString()}
          <span className="text-tertiary ml-1">&mdash; awaiting assembly</span>
        </p>
      )}
      {status === "assembled" && production?.assembledAt && (
        <p className="text-xs text-purple-500 flex items-center gap-1">
          <CheckCircle size={12} weight="fill" />
          Assembled {new Date(production.assembledAt).toLocaleDateString()}
          <span className="text-tertiary ml-1">&mdash; awaiting QC</span>
        </p>
      )}

      {/* Manufacturing Summary */}
      <ManufacturingSummaryCard
        width={win.width}
        height={win.height}
        depth={win.depth}
        windowInstallation={win.windowInstallation}
        wandChain={win.wandChain}
        fabricAdjustmentSide={win.fabricAdjustmentSide}
        fabricAdjustmentInches={win.fabricAdjustmentInches}
        blindType={win.blindType}
        chainSide={win.chainSide}
      />

      {/* Action */}
      {status === "pending" && (
        <button
          onClick={handleMarkCut}
          disabled={pending}
          className="mt-1 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-accent text-white text-sm font-medium active:opacity-80 disabled:opacity-50 transition-opacity"
        >
          <Scissors size={16} weight="fill" />
          {pending ? "Saving\u2026" : "Mark as Cut"}
        </button>
      )}
    </div>
  );
}

export function CutterUnitDetail({ detail }: { detail: DetailType }) {
  const router = useRouter();
  const { unit, rooms } = detail;

  // Local optimistic window state — starts from server data, updates instantly on tap
  const [windows, setWindows] = useState(detail.windows);

  const handleCut = (windowId: string) => {
    setWindows((prev) =>
      prev.map((w) =>
        w.id === windowId
          ? {
              ...w,
              production: {
                ...(w.production ?? {
                  id: "",
                  windowId,
                  unitId: unit.id,
                  cutByCutterId: null,
                  cutAt: null,
                  cutNotes: "",
                  assembledByAssemblerId: null,
                  assembledAt: null,
                  assembledNotes: "",
                  qcApprovedByAssemblerId: null,
                  qcApprovedByQcId: null,
                  qcApprovedAt: null,
                  qcNotes: "",
                  issueStatus: "none" as const,
                  issueReason: "",
                  issueNotes: "",
                  issueReportedByRole: null,
                  issueReportedAt: null,
                  issueResolvedAt: null,
                  manufacturingLabelPrintedAt: null,
                  packagingLabelPrintedAt: null,
                  createdAt: new Date().toISOString(),
                }),
                status: "cut" as const,
                cutAt: new Date().toISOString(),
              },
            }
          : w
      )
    );
  };

  const cutCount = windows.filter(
    (w) => w.production?.status === "cut" || w.production?.status === "assembled" || w.production?.status === "qc_approved"
  ).length;
  const total = windows.length;

  const allMfgPrinted = total > 0 && windows.every((w) => w.production?.manufacturingLabelPrintedAt);
  const allPkgPrinted = total > 0 && windows.every((w) => w.production?.packagingLabelPrintedAt);

  const daysUntil = unit.installationDate
    ? Math.floor(
        (new Date(unit.installationDate).getTime() - new Date().setHours(0, 0, 0, 0)) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  return (
    <div className="px-4 pt-4 pb-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-tertiary"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-primary truncate">
            Unit {unit.unitNumber}
          </h1>
          <p className="text-xs text-tertiary truncate">
            {unit.buildingName}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-secondary font-medium">Cutting Progress</span>
          <span className="text-tertiary">{cutCount}/{total} cut</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all"
            style={{ width: total > 0 ? `${(cutCount / total) * 100}%` : "0%" }}
          />
        </div>
        {unit.installationDate && (
          <p className="text-xs text-tertiary">
            Install: {unit.installationDate}
            {daysUntil !== null && (
              <span className={`ml-2 font-medium ${daysUntil < 0 ? "text-red-600" : daysUntil <= 3 ? "text-yellow-600" : "text-secondary"}`}>
                {daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` : daysUntil === 0 ? "Today" : `${daysUntil}d away`}
              </span>
            )}
          </p>
        )}
        {(allMfgPrinted || allPkgPrinted) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {allMfgPrinted && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-zinc-100 text-zinc-700 border-zinc-300">
                MFG labels printed
              </span>
            )}
            {allPkgPrinted && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                PKG labels printed
              </span>
            )}
          </div>
        )}
      </div>

      {/* Windows by room */}
      {rooms.map((room) => {
        const roomWindows = windows.filter((w) => w.roomId === room.id);
        if (roomWindows.length === 0) return null;
        return (
          <div key={room.id} className="space-y-2">
            <p className="text-xs font-semibold text-secondary uppercase tracking-wide px-1">
              {room.name}
            </p>
            {roomWindows.map((win) => (
              <WindowCard key={win.id} window={win} roomName={room.name} onCut={handleCut} />
            ))}
          </div>
        );
      })}

      {windows.length === 0 && (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-8 text-center">
          <p className="text-sm text-tertiary">No windows recorded for this unit.</p>
        </div>
      )}
    </div>
  );
}
