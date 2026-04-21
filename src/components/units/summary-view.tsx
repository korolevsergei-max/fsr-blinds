"use client";

import { useRef } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Export,
  ShareNetwork,
  Envelope,
  Ruler,
} from "@phosphor-icons/react";
import { getRoomsByUnit, getWindowsByRoom } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import { UNIT_STATUS_LABELS } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/ui/risk-badge";

export function SummaryView({
  data,
  routeBasePath,
}: {
  data: AppDataset;
  routeBasePath: "/installer/units" | "/scheduler/units" | "/management/units";
}) {
  const { id } = useParams<{ id: string }>();
  const printRef = useRef<HTMLDivElement>(null);
  const unit = data.units.find((u) => u.id === id);
  const rooms = unit ? getRoomsByUnit(data, unit.id) : [];

  if (!unit) {
    return <div className="p-6 text-center text-muted">Unit not found</div>;
  }

  const handleExport = async () => {
    const el = printRef.current;
    if (!el) return;

    try {
      const { default: html2canvas } = await import("html2canvas-pro");
      const canvas = await html2canvas(el, { scale: 2, useCORS: true });
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) return;
      const file = new File(
        [blob],
        `${unit.unitNumber}-summary.png`,
        { type: "image/png" }
      );

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `Summary — ${unit.unitNumber}`,
          files: [file],
        });
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.print();
    }
  };

  const handleEmail = async () => {
    const subject = encodeURIComponent(`Summary — ${unit.unitNumber}`);
    let body = `Unit: ${unit.unitNumber}\nBuilding: ${unit.buildingName}\nClient: ${unit.clientName}\nStatus: ${UNIT_STATUS_LABELS[unit.status]}\n\n`;

    rooms.forEach((room) => {
      const wins = getWindowsByRoom(data, room.id);
      body += `--- ${room.name} (${wins.length} window${wins.length !== 1 ? "s" : ""}) ---\n`;
      wins.forEach((w) => {
        body += `  ${w.label}: ${w.blindType}`;
        if (w.width != null && w.height != null)
          body += `, ${w.width}" x ${w.height}"`;
        if (w.depth != null) body += ` x ${w.depth}"`;
        if (w.notes) body += ` — ${w.notes}`;
        body += "\n";
      });
      body += "\n";
    });

    window.location.href = `mailto:?subject=${subject}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title="Unit Summary"
        subtitle={`${unit.unitNumber} • ${unit.buildingName}`}
        backHref={`${routeBasePath}/${unit.id}`}
        actions={
          <div className="flex items-center gap-1">
            <button
              onClick={handleEmail}
              className="p-2 rounded-xl text-accent hover:bg-accent/5 transition-colors"
              title="Email summary"
            >
              <Envelope size={20} />
            </button>
            <button
              onClick={handleExport}
              className="p-2 rounded-xl text-accent hover:bg-accent/5 transition-colors"
              title="Export / Share"
            >
              <ShareNetwork size={20} />
            </button>
          </div>
        }
      />

      <div className="flex-1 px-5 py-5 flex flex-col gap-4 pb-32">
        <div ref={printRef} className="flex flex-col gap-4 bg-white">
          {/* Unit header card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white rounded-2xl border border-border p-5"
          >
            <p className="text-base font-bold text-foreground tracking-tight">
              {unit.unitNumber}
            </p>
            <p className="text-xs text-muted mt-0.5">
              {unit.buildingName} • {unit.clientName}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="px-2.5 py-1 bg-accent/8 rounded-full text-accent font-semibold">
                {UNIT_STATUS_LABELS[unit.status]}
              </span>
              <span className="px-2.5 py-1 bg-surface rounded-full text-zinc-600 font-medium">
                {rooms.length} room{rooms.length !== 1 ? "s" : ""}
              </span>
              <span className="px-2.5 py-1 bg-surface rounded-full text-zinc-600 font-medium">
                {unit.windowCount} window{unit.windowCount !== 1 ? "s" : ""}
              </span>
            </div>
          </motion.div>

          {rooms.map((room, ri) => {
            const wins = getWindowsByRoom(data, room.id);
            return (
              <motion.div
                key={room.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.06 * (ri + 1),
                  duration: 0.3,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="bg-white rounded-2xl border border-border overflow-hidden"
              >
                <div className="px-5 py-3.5 bg-surface border-b border-border">
                  <p className="text-sm font-bold text-foreground tracking-tight">
                    {room.name}
                  </p>
                  <p className="text-[11px] text-muted">
                    {wins.length} window{wins.length !== 1 ? "s" : ""} •{" "}
                    {room.completedWindows} measured
                  </p>
                </div>

                {wins.length === 0 ? (
                  <p className="px-5 py-4 text-xs text-zinc-400 italic">
                    No windows recorded
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {wins.map((w) => (
                      <div key={w.id} className="px-5 py-3.5">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {w.label}
                            </p>
                            <span
                              className={`inline-flex mt-0.5 px-1.5 py-px rounded text-[10px] font-bold uppercase tracking-wider ${
                                w.blindType === "blackout"
                                  ? "bg-zinc-900 text-white"
                                  : "bg-zinc-100 text-zinc-600"
                              }`}
                            >
                              {w.blindType}
                            </span>
                          </div>
                          <RiskBadge flag={w.riskFlag} />
                        </div>

                        <div className="mt-2.5 flex flex-col gap-1.5">
                          {/* Window measurements — always shown */}
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 min-w-[56px]">
                              <Ruler size={12} className="text-zinc-400 flex-shrink-0" />
                              <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                                Window
                              </span>
                            </div>
                            {w.width != null && w.height != null ? (
                              <span className="text-xs font-mono font-semibold text-foreground">
                                {w.width}&quot; × {w.height}&quot;
                                {w.depth != null && (
                                  <span className="text-zinc-500"> × {w.depth}&quot;</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-xs text-zinc-400 italic">Not yet measured</span>
                            )}
                          </div>

                          {/* Fabric adjustment */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-muted uppercase tracking-wider min-w-[56px]">
                              Fab. adj.
                            </span>
                            <span className="text-xs font-mono font-semibold text-foreground">
                              {w.fabricAdjustmentSide === "none"
                                ? "None"
                                : `${w.fabricAdjustmentSide.charAt(0).toUpperCase() + w.fabricAdjustmentSide.slice(1)} +${w.fabricAdjustmentInches}"`}
                            </span>
                          </div>

                          {/* Wand & chain */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-muted uppercase tracking-wider min-w-[56px]">
                              Wand
                            </span>
                            <span className="text-xs font-mono font-semibold text-foreground">
                              {w.wandChain != null ? `${w.wandChain}"` : <span className="text-zinc-400 font-normal not-italic">Not set</span>}
                            </span>
                          </div>

                          {/* Chain side */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-muted uppercase tracking-wider min-w-[56px]">
                              Chain
                            </span>
                            <span className="text-xs font-mono font-semibold text-foreground">
                              {w.chainSide != null
                                ? w.chainSide.charAt(0).toUpperCase() + w.chainSide.slice(1)
                                : <span className="text-zinc-400 font-normal">Not set</span>}
                            </span>
                          </div>
                        </div>

                        {w.notes && (
                          <p className="mt-1.5 text-xs text-zinc-500 italic">
                            {w.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 * (rooms.length + 2), duration: 0.3 }}
          className="pt-2"
        >
          <Button fullWidth size="lg" onClick={handleExport}>
            <Export size={18} weight="bold" />
            Export Summary
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
