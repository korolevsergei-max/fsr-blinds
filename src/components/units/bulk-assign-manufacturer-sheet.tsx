"use client";

import { useState, useTransition } from "react";

import { CheckCircle, Factory, X } from "@phosphor-icons/react";
import { assignUnitsToManufacturingPartner } from "@/app/actions/management-actions";
import { Button } from "@/components/ui/button";
import { INTERNAL_PARTNER_ID, sortPartners } from "@/lib/manufacturing-partners";
import type { ManufacturingPartner, Unit } from "@/lib/types";

type Props = {
  /**
   * Whole units, not ids: the sheet has to know which ones are locked. The server
   * action rejects a batch containing ANY locked unit — deliberately, so a partial
   * write can't silently happen — so submitting the raw selection would fail the
   * whole thing over one in-production unit and give no clue which.
   */
  units: Unit[];
  partners: ManufacturingPartner[];
  onClose: () => void;
  onSuccess: () => void;
};

export function BulkAssignManufacturerSheet({
  units,
  partners,
  onClose,
  onSuccess,
}: Props) {
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const ordered = sortPartners(partners);
  const internalIds = new Set(partners.filter((p) => p.isInternal).map((p) => p.id));
  const target = partners.find((p) => p.id === selectedPartnerId);
  const targetIsStation = target?.isInternal ?? false;

  // What is movable depends on WHERE it is going, which is why this is computed
  // after the destination is picked rather than once up front.
  //
  // A lock freezes a unit against a change of COMPANY. Moving between two of our
  // own stations rebuilds nothing — the blinds walk down the hall with all their
  // recorded work — so a locked in-house unit is perfectly movable to a station
  // and only stuck when the destination is a vendor. Mirrors the isRelocation
  // branch in assignUnitsToManufacturingPartner and v_relocation in the trigger.
  const isRelocation = (u: Unit) =>
    targetIsStation && internalIds.has(u.manufacturingPartnerId ?? INTERNAL_PARTNER_ID);
  const movable = units.filter((u) => !u.manufacturingLocked || isRelocation(u));
  const skippedCount = units.length - movable.length;

  // The physical hand-off, aggregated across the selection: these blinds exist
  // and somebody has to carry them to the new station.
  const relocating = movable.filter((u) => u.manufacturingLocked && isRelocation(u));
  const blindsToCarry = relocating.reduce(
    (total, u) => total + (u.manufacturingLockStartedCount ?? 0),
    0
  );

  const handleSave = () => {
    if (!selectedPartnerId || movable.length === 0) return;
    setError("");
    startTransition(async () => {
      const result = await assignUnitsToManufacturingPartner(
        selectedPartnerId,
        movable.map((u) => u.id)
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 900);
    });
  };

  return (
    <>
      <div
        key="manufacturer-sheet-backdrop"
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30"
        onClick={onClose}
      />
      <div
        key="manufacturer-sheet-content"
        className="animate-slide-up fixed bottom-0 left-0 right-0 z-40 bg-card rounded-t-[var(--radius-xl)] shadow-2xl max-h-[80dvh] overflow-y-auto"
      >
        <div className="px-4 pt-4 pb-2 flex items-center justify-between border-b border-border">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">Assign Manufacturer</h2>
            <p className="text-[12px] text-tertiary">
              {units.length} unit{units.length !== 1 ? "s" : ""} selected
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 transition-colors"
          >
            <X size={18} className="text-zinc-500" />
          </button>
        </div>

        <div className="px-4 py-5 flex flex-col gap-5">
          {error && (
            <div className="rounded-[var(--radius-md)] border px-3.5 py-3 text-[13px] leading-snug font-medium bg-danger-light border-[rgba(200,57,43,0.2)] text-danger">
              {error}
            </div>
          )}

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted mb-3">
              Who manufactures these units
            </p>
            <div className="flex flex-col gap-2">
              {ordered.length === 0 && (
                <p className="py-4 text-center text-[13px] text-muted">
                  No manufacturers found. Add one in Settings first.
                </p>
              )}
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
                    <Factory
                      size={16}
                      className={p.isInternal ? "text-emerald-600" : "text-amber-600"}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-[14px] font-medium text-foreground truncate">
                      {p.name}
                    </span>
                    <span className="block text-[11px] text-tertiary truncate">
                      {p.isInternal ? "In-house station" : p.contactEmail || "Subcontractor"}
                    </span>
                  </div>
                  {selectedPartnerId === p.id && (
                    <CheckCircle size={18} weight="fill" className="text-accent flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-tertiary mt-3 leading-snug">
              A unit only ever sits in one place. Moving it out of a station clears it from
              that station&apos;s cutting, assembly and QC queues and frees its capacity.
            </p>
            {relocating.length > 0 && (
              <p className="text-[11px] text-tertiary mt-2 leading-snug">
                {relocating.length} unit{relocating.length !== 1 ? "s" : ""} already part-built
                {blindsToCarry > 0 && (
                  <>
                    {" "}
                    — {blindsToCarry} blind{blindsToCarry !== 1 ? "s" : ""} to move physically
                  </>
                )}
                . All recorded work moves with them; nothing is rebuilt.
              </p>
            )}
            {skippedCount > 0 && (
              <p className="text-[11px] text-muted mt-2 leading-snug">
                {skippedCount} unit{skippedCount !== 1 ? "s" : ""} skipped — manufacturing
                already started and {skippedCount === 1 ? "it is" : "they are"} going to a
                different company. Open {skippedCount === 1 ? "it" : "them"} individually to
                transfer.
              </p>
            )}
          </div>

          <div className="pb-32">
            {saved ? (
              <div className="animate-fade-scale flex items-center justify-center gap-2 h-13 rounded-xl bg-emerald-500 text-white font-semibold">
                <CheckCircle size={20} weight="fill" />
                Assigned
              </div>
            ) : (
              <Button
                fullWidth
                size="lg"
                disabled={!selectedPartnerId || pending || movable.length === 0}
                onClick={handleSave}
              >
                {pending
                  ? "Assigning…"
                  : movable.length === 0
                    ? "Nothing to assign"
                    : `${targetIsStation ? "Move" : "Assign"} ${movable.length} Unit${movable.length !== 1 ? "s" : ""}`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
