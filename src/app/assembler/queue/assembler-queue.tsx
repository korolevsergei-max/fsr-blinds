"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, Wrench, Hourglass, CalendarBlank } from "@phosphor-icons/react";
import type { AssemblerUnit } from "@/lib/assembler-data";

type Filter = "all" | "partial" | "ready" | "qc";

function UnitRow({ unit }: { unit: AssemblerUnit }) {
  const router = useRouter();
  const allCut = unit.cutCount >= unit.windowCount && unit.windowCount > 0;
  const hasAssembled = unit.assembledCount > unit.qcApprovedCount;
  const borderColor = hasAssembled
    ? "border-green-200"
    : allCut
    ? "border-blue-200"
    : "border-border";

  return (
    <button
      onClick={() => router.push(`/assembler/units/${unit.id}`)}
      className={`w-full text-left rounded-xl border ${borderColor} bg-card px-4 py-3.5 space-y-1.5 active:opacity-70 transition-opacity hover:bg-muted/30`}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm text-primary">
          Unit {unit.unitNumber}
        </span>
        {hasAssembled ? (
          <span className="text-xs font-semibold text-green-600 flex items-center gap-1">
            <CheckCircle size={13} weight="fill" />
            Ready for QC
          </span>
        ) : allCut ? (
          <span className="text-xs font-semibold text-blue-600 flex items-center gap-1">
            <Wrench size={13} weight="fill" />
            Ready to Assemble
          </span>
        ) : (
          <span className="text-xs text-yellow-600 flex items-center gap-1">
            <Hourglass size={13} weight="fill" />
            Partially cut
          </span>
        )}
      </div>
      <p className="text-xs text-secondary">
        {unit.buildingName} &middot; {unit.clientName}
      </p>
      <div className="flex items-center justify-between pt-0.5">
        <span className="text-xs text-tertiary">
          {unit.cutCount}/{unit.windowCount} cut &middot; {unit.assembledCount} assembled &middot; {unit.qcApprovedCount} QC&apos;d
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

export function AssemblerQueue({ units }: { units: AssemblerUnit[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");

  // Units with assembled windows needing QC
  const readyForQC = units.filter(
    (u) => u.assembledCount > u.qcApprovedCount && u.assembledCount > 0
  );
  // Units fully cut, ready to assemble
  const readyToAssemble = units.filter(
    (u) => u.cutCount >= u.windowCount && u.assembledCount < u.windowCount && u.windowCount > 0
  );
  // Partially cut units
  const partiallyCut = units.filter(
    (u) => u.cutCount > 0 && u.cutCount < u.windowCount
  );

  const tabs: { key: Filter; label: string; count: number; color: string }[] = [
    { key: "all", label: "All", count: units.length, color: "text-secondary" },
    { key: "partial", label: "Partial Cut", count: partiallyCut.length, color: "text-yellow-600" },
    { key: "ready", label: "To Assemble", count: readyToAssemble.length, color: "text-blue-600" },
    { key: "qc", label: "QC", count: readyForQC.length, color: "text-green-600" },
  ];

  const visibleReadyForQC = filter === "all" || filter === "qc" ? readyForQC : [];
  const visibleReadyToAssemble = filter === "all" || filter === "ready" ? readyToAssemble : [];
  const visiblePartiallyCut = filter === "all" || filter === "partial" ? partiallyCut : [];

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-tertiary"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-primary">Assembly &amp; QC Queue</h1>
          <p className="text-xs text-tertiary">
            {units.length} unit{units.length !== 1 ? "s" : ""} in queue
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      {units.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                filter === tab.key
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-secondary border-border hover:border-zinc-300"
              }`}
            >
              {tab.label}
              <span className={`font-bold ${filter === tab.key ? "text-background/70" : tab.color}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {units.length === 0 ? (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-10 text-center">
          <p className="text-sm font-medium text-primary">Nothing to assemble</p>
          <p className="text-xs text-tertiary mt-1">
            Units appear here once the cutter marks windows as cut.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {visibleReadyForQC.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <CheckCircle size={14} weight="fill" className="text-green-500" />
                <span className="text-xs font-semibold text-secondary uppercase tracking-wider">
                  Ready for QC
                </span>
                <span className="ml-auto text-xs text-tertiary">{visibleReadyForQC.length}</span>
              </div>
              {visibleReadyForQC.map((u) => (
                <UnitRow key={u.id} unit={u} />
              ))}
            </div>
          )}
          {visibleReadyToAssemble.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Wrench size={14} weight="fill" className="text-blue-500" />
                <span className="text-xs font-semibold text-secondary uppercase tracking-wider">
                  Ready to Assemble
                </span>
                <span className="ml-auto text-xs text-tertiary">{visibleReadyToAssemble.length}</span>
              </div>
              {visibleReadyToAssemble.map((u) => (
                <UnitRow key={u.id} unit={u} />
              ))}
            </div>
          )}
          {visiblePartiallyCut.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Hourglass size={14} weight="fill" className="text-yellow-500" />
                <span className="text-xs font-semibold text-secondary uppercase tracking-wider">
                  Partially Cut
                </span>
                <span className="ml-auto text-xs text-tertiary">{visiblePartiallyCut.length}</span>
              </div>
              {visiblePartiallyCut.map((u) => (
                <UnitRow key={u.id} unit={u} />
              ))}
            </div>
          )}
          {visibleReadyForQC.length === 0 && visibleReadyToAssemble.length === 0 && visiblePartiallyCut.length === 0 && (
            <p className="text-center text-sm text-tertiary py-6">No units in this category.</p>
          )}
        </div>
      )}
    </div>
  );
}
