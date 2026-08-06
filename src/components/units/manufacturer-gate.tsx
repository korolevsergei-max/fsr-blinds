"use client";

import { useState, useTransition } from "react";
import { ArrowRight, CheckCircle, Factory } from "@phosphor-icons/react";

import { assignUnitsToManufacturingPartner } from "@/app/actions/management-actions";
import { Button } from "@/components/ui/button";
import { useDatasetSelectorMaybe } from "@/lib/dataset-context";
import { sortPartners } from "@/lib/manufacturing-partners";
import type { Unit } from "@/lib/types";

/**
 * Ask who manufactures a unit BEFORE its first room exists.
 *
 * Routing has to happen at the source. Once rooms and windows are added the unit
 * is swept into the in-house factory schedule by reflowManufacturingSchedules,
 * and moving it out afterwards means deleting schedule rows and re-planning
 * capacity. Asking here — the earliest point in the journey where someone is
 * already looking at the unit — means a subcontracted unit never enters the
 * internal queues at all.
 *
 * `manufacturing_assigned_at IS NULL` is the "nobody has decided yet" signal:
 * `manufacturing_partner_id` defaults to in-house, so the id alone cannot
 * distinguish a deliberate choice from an untouched default.
 *
 * INSTALLERS ARE NOT GATED. They add rooms on site and cannot answer this — the
 * assign action requires owner/scheduler and the `units_guard_ownership_columns`
 * trigger would reject the write. Blocking them would strand the field team on a
 * question only the office can answer.
 */
export function ManufacturerGate({
  unit,
  routeBasePath,
  children,
}: {
  unit: Unit;
  routeBasePath: "/installer/units" | "/scheduler/units" | "/management/units";
  children: React.ReactNode;
}) {
  const partners = useDatasetSelectorMaybe((value) => value.data.manufacturingPartners) ?? [];
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);

  const canAssign = routeBasePath !== "/installer/units";
  const needsChoice = !unit.manufacturingAssignedAt;

  if (!needsChoice || !canAssign || partners.length === 0 || justSaved) {
    return <>{children}</>;
  }

  const handleConfirm = () => {
    if (!selectedPartnerId) return;
    setError("");
    startTransition(async () => {
      const result = await assignUnitsToManufacturingPartner(selectedPartnerId, [unit.id]);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Reveal the room editor immediately; the dataset catches up on the next
      // refresh, and the reflow runs in after() so waiting for it would stall.
      setJustSaved(true);
    });
  };

  const ordered = sortPartners(partners);

  return (
    <div className="px-4 py-6 flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="w-11 h-11 rounded-[var(--radius-md)] bg-amber-100 flex items-center justify-center">
          <Factory size={22} className="text-amber-600" />
        </div>
        <h2 className="text-[17px] font-semibold tracking-tight text-foreground">
          Who manufactures Unit {unit.unitNumber}?
        </h2>
        <p className="text-[13px] text-tertiary leading-snug">
          Set this before adding rooms so the unit is routed correctly from the start.
          Subcontracted units skip the in-house cutting, assembly and QC queues entirely.
          You can change it later from the unit or the units list.
        </p>
      </div>

      {error && (
        <div className="rounded-[var(--radius-md)] border border-[rgba(200,57,43,0.2)] bg-danger-light px-3.5 py-3 text-[13px] font-medium text-danger">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {ordered.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelectedPartnerId(p.id)}
            className={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] border text-left transition-all active:scale-[0.98] ${
              selectedPartnerId === p.id
                ? "border-accent bg-accent-light"
                : "border-border bg-card hover:bg-surface"
            }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center ${
                p.isInternal ? "bg-emerald-100" : "bg-amber-100"
              }`}
            >
              <Factory size={16} className={p.isInternal ? "text-emerald-600" : "text-amber-600"} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="block text-[14px] font-medium text-foreground truncate">
                {p.name}
              </span>
              <span className="block text-[11px] text-tertiary truncate">
                {p.isInternal ? "In-house factory" : p.contactEmail || "Subcontractor"}
              </span>
            </div>
            {selectedPartnerId === p.id && (
              <CheckCircle size={18} weight="fill" className="text-accent flex-shrink-0" />
            )}
          </button>
        ))}
      </div>

      <Button fullWidth size="lg" disabled={!selectedPartnerId || pending} onClick={handleConfirm}>
        {pending ? "Saving…" : "Continue to rooms"}
        {!pending && <ArrowRight size={16} weight="bold" />}
      </Button>
    </div>
  );
}
