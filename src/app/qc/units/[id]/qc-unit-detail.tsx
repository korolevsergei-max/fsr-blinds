"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  Scissors,
  Wrench,
  Ruler,
  Warning,
  Hourglass,
  ShieldCheck,
} from "@phosphor-icons/react";
import { markWindowQCApproved } from "@/app/actions/production-actions";
import {
  returnWindowToAssembler,
  returnWindowToCutter,
} from "@/app/actions/manufacturing-actions";
import type { AssemblerUnitDetail as DetailType, AssemblerWindow } from "@/lib/assembler-data";
import { PRODUCTION_STATUS_LABELS } from "@/lib/types";

function formatDim(val: number | null): string {
  if (val === null) return "\u2014";
  return `${val}"`;
}

function QcWindowCard({
  window,
  roomName,
  onApproveQC,
}: {
  window: AssemblerWindow;
  roomName: string;
  onApproveQC: (windowId: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const production = window.production;
  const status = production?.status ?? "pending";

  const w = window.blindWidth ?? window.width;
  const h = window.blindHeight ?? window.height;
  const d = window.blindDepth ?? window.depth;

  const statusColors: Record<string, string> = {
    pending: "bg-gray-50 text-gray-500 border-gray-200",
    cut: "bg-blue-50 text-blue-600 border-blue-200",
    assembled: "bg-purple-50 text-purple-600 border-purple-200",
    qc_approved: "bg-green-50 text-green-600 border-green-200",
  };

  function handleApproveQC() {
    onApproveQC(window.id);
    startTransition(async () => {
      const result = await markWindowQCApproved(window.id);
      if (!result.ok) {
        globalThis.window.alert(result.error ?? "Failed to approve QC.");
        router.refresh();
      }
    });
  }

  function handleReturnToAssembler() {
    startTransition(async () => {
      const reason = globalThis.window.prompt("Why is this blind being returned to assembler?");
      if (!reason) return;
      const result = await returnWindowToAssembler(window.id, reason, "");
      if (!result.ok) {
        globalThis.window.alert(result.error ?? "Failed to return blind to assembler.");
      }
      router.refresh();
    });
  }

  function handleReturnToCutter() {
    startTransition(async () => {
      const reason = globalThis.window.prompt("Why is this blind being returned to cutter?");
      if (!reason) return;
      const result = await returnWindowToCutter(window.id, reason, "");
      if (!result.ok) {
        globalThis.window.alert(result.error ?? "Failed to return blind to cutter.");
      }
      router.refresh();
    });
  }

  return (
    <div className={`rounded-xl border px-4 py-3.5 space-y-2 ${statusColors[status] ?? statusColors.pending}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm text-primary">{window.label}</p>
          <p className="text-xs text-tertiary">{roomName}</p>
        </div>
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${statusColors[status] ?? statusColors.pending}`}
        >
          {PRODUCTION_STATUS_LABELS[status]}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-secondary">
        <span className="flex items-center gap-1">
          <Ruler size={12} />
          {formatDim(w)} &times; {formatDim(h)}
          {d !== null ? ` \u00d7 ${formatDim(d)}` : ""}
        </span>
        <span className="px-1.5 py-0.5 bg-card border border-border rounded text-[10px] font-medium text-primary">
          {window.blindType === "blackout" ? "Blackout" : "Screen"}
        </span>
      </div>

      {window.notes && (
        <p className="text-xs text-secondary flex items-start gap-1.5">
          <Warning size={12} className="mt-0.5 shrink-0 text-yellow-500" />
          {window.notes}
        </p>
      )}

      {status === "cut" && production?.cutAt && (
        <p className="text-xs text-blue-500 flex items-center gap-1">
          <Scissors size={12} weight="fill" />
          Cut {new Date(production.cutAt).toLocaleDateString()}
        </p>
      )}
      {status === "assembled" && production?.assembledAt && (
        <p className="text-xs text-purple-500 flex items-center gap-1">
          <Wrench size={12} weight="fill" />
          Assembled {new Date(production.assembledAt).toLocaleDateString()}
        </p>
      )}
      {status === "qc_approved" && production?.qcApprovedAt && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <CheckCircle size={12} weight="fill" />
          Built fully {new Date(production.qcApprovedAt).toLocaleDateString()}
        </p>
      )}

      {status === "assembled" && (
        <div className="flex flex-col gap-2 pt-1">
          <button
            onClick={handleApproveQC}
            disabled={pending}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium active:opacity-80 disabled:opacity-50 transition-opacity"
          >
            <ShieldCheck size={16} weight="fill" />
            {pending ? "Approving…" : "Approve QC"}
          </button>
          <button
            onClick={handleReturnToAssembler}
            disabled={pending}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-100 text-amber-800 text-sm font-medium active:opacity-80 disabled:opacity-50 transition-opacity"
          >
            <Warning size={16} weight="fill" />
            {pending ? "Saving…" : "Return to Assembler"}
          </button>
          <button
            onClick={handleReturnToCutter}
            disabled={pending}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-100 text-amber-800 text-sm font-medium active:opacity-80 disabled:opacity-50 transition-opacity"
          >
            <Warning size={16} weight="fill" />
            {pending ? "Saving…" : "Return to Cutter"}
          </button>
        </div>
      )}

      {status === "pending" && (
        <p className="text-xs text-tertiary flex items-center gap-1">
          <Hourglass size={12} />
          Not yet cut
        </p>
      )}
    </div>
  );
}

export function QcUnitDetail({ detail }: { detail: DetailType }) {
  const router = useRouter();
  const { unit, rooms } = detail;
  const [windows, setWindows] = useState(detail.windows);

  const handleApproveQC = (windowId: string) => {
    setWindows((prev) =>
      prev.map((windowItem) =>
        windowItem.id === windowId
          ? {
              ...windowItem,
              production: {
                ...(windowItem.production ?? {
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
                  createdAt: new Date().toISOString(),
                }),
                status: "qc_approved" as const,
                qcApprovedAt: new Date().toISOString(),
              },
            }
          : windowItem
      )
    );
  };

  const total = windows.length;
  const qcApprovedCount = windows.filter(
    (windowItem) => windowItem.production?.status === "qc_approved"
  ).length;

  return (
    <div className="px-4 pt-4 pb-6 space-y-5">
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
            {unit.buildingName} &middot; {unit.clientName}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-secondary font-medium">QC Progress</span>
          <span className="text-tertiary">{qcApprovedCount}/{total} QC&apos;d</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: total > 0 ? `${(qcApprovedCount / total) * 100}%` : "0%" }}
          />
        </div>
        {unit.installationDate && (
          <p className="text-xs text-tertiary">Install: {unit.installationDate}</p>
        )}
      </div>

      {rooms.map((room) => {
        const roomWindows = windows.filter((w) => w.roomId === room.id);
        if (roomWindows.length === 0) return null;
        return (
          <div key={room.id} className="space-y-2">
            <p className="text-xs font-semibold text-secondary uppercase tracking-wide px-1">
              {room.name}
            </p>
            {roomWindows.map((win) => (
              <QcWindowCard
                key={win.id}
                window={win}
                roomName={room.name}
                onApproveQC={handleApproveQC}
              />
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
