"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  Hammer,
  Ruler,
  Warning,
} from "@phosphor-icons/react";
import { markWindowBuilt } from "@/app/actions/manufacturer-actions";
import type { ManufacturerUnitDetail as DetailType, ManufacturerWindow } from "@/lib/manufacturer-data";
import { PRODUCTION_STATUS_LABELS } from "@/lib/types";

function formatDim(val: number | null): string {
  if (val === null) return "—";
  return `${val}"`;
}

function WindowCard({ window, roomName }: { window: ManufacturerWindow; roomName: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const production = window.production;
  const status = production?.status ?? "pending";

  // Use blind dimensions if available, fall back to frame dimensions
  const w = window.blindWidth ?? window.width;
  const h = window.blindHeight ?? window.height;
  const d = window.blindDepth ?? window.depth;

  const statusColors = {
    pending: "bg-gray-100 text-gray-500 border-gray-200",
    built: "bg-blue-50 text-blue-600 border-blue-200",
    qc_approved: "bg-green-50 text-green-600 border-green-200",
  };

  const blindTypeLabel =
    window.blindType === "blackout" ? "Blackout" : "Screen";

  function handleMarkBuilt() {
    startTransition(async () => {
      await markWindowBuilt(window.id);
      router.refresh();
    });
  }

  return (
    <div
      className={`rounded-xl border px-4 py-3.5 space-y-2 ${statusColors[status]}`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm text-primary">{window.label}</p>
          <p className="text-xs text-tertiary">{roomName}</p>
        </div>
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${statusColors[status]}`}
        >
          {PRODUCTION_STATUS_LABELS[status]}
        </span>
      </div>

      {/* Specs */}
      <div className="flex items-center gap-3 text-xs text-secondary">
        <span className="flex items-center gap-1">
          <Ruler size={12} />
          {formatDim(w)} × {formatDim(h)}
          {d !== null ? ` × ${formatDim(d)}` : ""}
        </span>
        <span className="px-1.5 py-0.5 bg-card border border-border rounded text-[10px] font-medium text-primary">
          {blindTypeLabel}
        </span>
      </div>

      {/* Notes */}
      {window.notes && (
        <p className="text-xs text-secondary flex items-start gap-1.5">
          <Warning size={12} className="mt-0.5 shrink-0 text-yellow-500" />
          {window.notes}
        </p>
      )}

      {/* QC info */}
      {status === "qc_approved" && production?.qcApprovedAt && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <CheckCircle size={12} weight="fill" />
          QC approved {new Date(production.qcApprovedAt).toLocaleDateString()}
        </p>
      )}
      {status === "built" && production?.builtAt && (
        <p className="text-xs text-blue-500 flex items-center gap-1">
          <Hammer size={12} weight="fill" />
          Built {new Date(production.builtAt).toLocaleDateString()}
          {production.qcApprovedAt === null && (
            <span className="text-tertiary ml-1">— awaiting QC</span>
          )}
        </p>
      )}

      {/* Action */}
      {status === "pending" && (
        <button
          onClick={handleMarkBuilt}
          disabled={pending}
          className="mt-1 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-accent text-white text-sm font-medium active:opacity-80 disabled:opacity-50 transition-opacity"
        >
          <Hammer size={16} weight="fill" />
          {pending ? "Marking…" : "Mark as Built"}
        </button>
      )}
    </div>
  );
}

export function ManufacturerUnitDetail({ detail }: { detail: DetailType }) {
  const router = useRouter();
  const { unit, rooms, windows } = detail;

  const builtCount = windows.filter(
    (w) => w.production?.status === "built" || w.production?.status === "qc_approved"
  ).length;
  const qcCount = windows.filter(
    (w) => w.production?.status === "qc_approved"
  ).length;
  const total = windows.length;

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
            {unit.buildingName} · {unit.clientName}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-secondary font-medium">Production Progress</span>
          <span className="text-tertiary">{builtCount}/{total} built · {qcCount}/{total} QC&apos;d</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all"
            style={{ width: total > 0 ? `${(builtCount / total) * 100}%` : "0%" }}
          />
        </div>
        {unit.installationDate && (
          <p className="text-xs text-tertiary">
            Install: {unit.installationDate}
            {daysUntil !== null && (
              <span
                className={`ml-2 font-medium ${
                  daysUntil < 0
                    ? "text-red-600"
                    : daysUntil <= 3
                    ? "text-yellow-600"
                    : "text-secondary"
                }`}
              >
                {daysUntil < 0
                  ? `${Math.abs(daysUntil)}d overdue`
                  : daysUntil === 0
                  ? "Today"
                  : `${daysUntil}d away`}
              </span>
            )}
          </p>
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
              <WindowCard key={win.id} window={win} roomName={room.name} />
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
