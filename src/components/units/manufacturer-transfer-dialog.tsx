"use client";

import { useState, useTransition } from "react";
import { Factory, Warning, X } from "@phosphor-icons/react";

import { assignUnitsToManufacturingPartner } from "@/app/actions/management-actions";
import { Button } from "@/components/ui/button";
import { sortPartners } from "@/lib/manufacturing-partners";
import type { ManufacturingPartner } from "@/lib/types";

/** What one part-built blind costs to build a second time. */
const REBUILD_COST_PER_BLIND = 100;

/**
 * Owner-only escape hatch for transferring a unit whose manufacturing has already
 * started.
 *
 * The point of this dialog is the cost line. Everything else here — the destination
 * list, the typed unit number — is standard; the reason it exists is that moving a
 * part-built unit makes the receiving side build those blinds again from scratch,
 * and nothing in the ordinary flow tells the owner that. Finished (QC-approved)
 * blinds survive a transfer; part-built ones do not.
 *
 * The typed unit number is an anti-fat-finger guard, not a security boundary. The
 * real enforcement is `units_guard_ownership_columns` in the database, which unlocks
 * only for an owner whose override stamp is fresh in the same UPDATE.
 */
export function ManufacturerTransferDialog({
  unitId,
  unitNumber,
  currentPartnerId,
  partners,
  startedCount,
  qcApprovedCount,
  onClose,
  onSuccess,
}: {
  unitId: string;
  unitNumber: string;
  currentPartnerId: string;
  partners: ManufacturingPartner[];
  /** Blinds past 'pending'. Undefined on routes that don't load production rows. */
  startedCount?: number;
  qcApprovedCount?: number;
  onClose: () => void;
  onSuccess: (partnerId: string) => void;
}) {
  const [destinationId, setDestinationId] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const destinations = sortPartners(partners).filter((p) => p.id !== currentPartnerId);

  // `startedCount` counts every blind past 'pending', which includes the finished
  // ones. Only the difference gets rebuilt.
  const inFlight =
    startedCount === undefined || qcApprovedCount === undefined
      ? undefined
      : Math.max(0, startedCount - qcApprovedCount);
  const rebuildCost = inFlight === undefined ? undefined : inFlight * REBUILD_COST_PER_BLIND;

  const numberMatches = typed.trim().toLowerCase() === unitNumber.trim().toLowerCase();
  const canConfirm = Boolean(destinationId) && numberMatches && !pending;

  const handleConfirm = () => {
    if (!canConfirm) return;
    setError("");
    startTransition(async () => {
      const result = await assignUnitsToManufacturingPartner(destinationId, [unitId], {
        unitId,
        confirmUnitNumber: typed.trim(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSuccess(destinationId);
      onClose();
    });
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30" onClick={onClose} />
      <div className="animate-slide-up fixed bottom-0 left-0 right-0 z-40 bg-card rounded-t-[var(--radius-xl)] shadow-2xl max-h-[85dvh] overflow-y-auto">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between border-b border-border">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-foreground">Transfer Manufacturer</h2>
            <p className="text-[12px] text-tertiary truncate">
              Unit {unitNumber} — manufacturing has already started
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 transition-colors shrink-0"
          >
            <X size={18} className="text-zinc-500" />
          </button>
        </div>

        <div className="px-4 py-5 flex flex-col gap-5">
          <div className="rounded-[var(--radius-md)] border border-[rgba(200,57,43,0.2)] bg-danger-light px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <Warning size={18} weight="fill" className="text-danger shrink-0 mt-0.5" />
              <div className="text-[13px] leading-snug text-danger">
                {inFlight === undefined ? (
                  <p className="font-medium">
                    Any part-built blinds on this unit will be built again from scratch by the
                    new manufacturer.
                  </p>
                ) : (
                  <>
                    <p className="font-medium">
                      {inFlight === 0
                        ? "No part-built blinds — nothing gets rebuilt."
                        : `${inFlight} part-built blind${inFlight === 1 ? "" : "s"} will be rebuilt — about $${rebuildCost}.`}
                    </p>
                    {qcApprovedCount !== undefined && qcApprovedCount > 0 && (
                      <p className="mt-1 opacity-80">
                        {qcApprovedCount} finished blind{qcApprovedCount === 1 ? "" : "s"} stay
                        finished.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted mb-3">
              Transfer to
            </p>
            <div className="flex flex-col gap-2">
              {destinations.length === 0 && (
                <p className="py-4 text-center text-[13px] text-muted">
                  No other manufacturer to transfer to.
                </p>
              )}
              {destinations.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setDestinationId(p.id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] border text-left transition-all active:scale-[0.98] ${
                    destinationId === p.id
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
                      {p.isInternal ? "In-house factory" : p.contactEmail || "Subcontractor"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="confirm-unit-number"
              className="block text-[11px] font-bold uppercase tracking-[0.08em] text-muted mb-2"
            >
              Type {unitNumber} to confirm
            </label>
            <input
              id="confirm-unit-number"
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              placeholder={unitNumber}
              className="w-full h-11 px-3 rounded-[var(--radius-md)] border border-border bg-card text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {error && (
            <div className="rounded-[var(--radius-md)] border px-3.5 py-3 text-[13px] leading-snug font-medium bg-danger-light border-[rgba(200,57,43,0.2)] text-danger">
              {error}
            </div>
          )}

          <div className="pb-32">
            <Button
              fullWidth
              size="lg"
              variant="danger"
              disabled={!canConfirm}
              onClick={handleConfirm}
            >
              {pending ? "Transferring…" : "Transfer anyway"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
