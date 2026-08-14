"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Factory, Package, X } from "@phosphor-icons/react";

import { assignUnitsToManufacturingPartner } from "@/app/actions/management-actions";
import { Button } from "@/components/ui/button";
import { sortPartners } from "@/lib/manufacturing-partners";
import type { ManufacturingPartner } from "@/lib/types";

/**
 * Move a unit from one in-house station to another.
 *
 * Deliberately NOT the ManufacturerTransferDialog. That dialog exists to price a
 * cross-company transfer: part-built blinds get built again from scratch at the
 * receiving company, ~$100 each, so it demands a typed unit number. None of that
 * is true here — a blind cut at Station A is a cut blind, Station B's assembler
 * assembles it, and `window_production_status` travels with the unit untouched.
 * Reusing that dialog would state a rebuild cost that does not exist.
 *
 * What this dialog is for is the ONE thing software cannot do: the cut and
 * assembled blinds are physical objects sitting at the old station, and somebody
 * has to carry them. That list is the whole point of the confirmation.
 */
export function StationMoveDialog({
  unitId,
  unitNumber,
  currentPartnerId,
  currentPartnerName,
  partners,
  startedCount,
  qcApprovedCount,
  onClose,
  onSuccess,
}: {
  unitId: string;
  unitNumber: string;
  currentPartnerId: string;
  currentPartnerName: string;
  partners: ManufacturingPartner[];
  /** Blinds past 'pending'. Undefined on routes that don't load production rows. */
  startedCount?: number;
  qcApprovedCount?: number;
  onClose: () => void;
  onSuccess: (partnerId: string) => void;
}) {
  const [destinationId, setDestinationId] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  // Only our own stations — a vendor destination is a transfer, not a move, and
  // goes through ManufacturerTransferDialog with its lock and confirmation.
  const destinations = sortPartners(partners).filter(
    (p) => p.isInternal && p.id !== currentPartnerId
  );

  // `startedCount` counts every blind past 'pending', which includes the
  // finished ones. Both groups physically move; only the split differs in how
  // it reads to whoever carries them.
  const inFlight =
    startedCount === undefined || qcApprovedCount === undefined
      ? undefined
      : Math.max(0, startedCount - qcApprovedCount);
  const finished = qcApprovedCount;
  const toCarry =
    inFlight === undefined || finished === undefined ? undefined : inFlight + finished;

  const handleConfirm = () => {
    if (!destinationId || pending) return;
    setError("");
    startTransition(async () => {
      // No override argument: a station move is not a locked transfer, so the
      // server takes the relocation path and the DB trigger's v_relocation
      // branch lets it through without an override stamp.
      const result = await assignUnitsToManufacturingPartner(destinationId, [unitId]);
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
            <h2 className="text-[15px] font-semibold text-foreground">Move to another station</h2>
            <p className="text-[12px] text-tertiary truncate">
              Unit {unitNumber} — currently at {currentPartnerName}
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
          {/* Informational, not a warning: nothing is lost or rebuilt. The amber
              tone would misread as danger and push owners away from a move that
              is entirely routine. */}
          <div className="rounded-[var(--radius-md)] border border-border bg-surface px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <Package size={18} weight="fill" className="text-accent shrink-0 mt-0.5" />
              <div className="text-[13px] leading-snug text-foreground">
                {toCarry === undefined ? (
                  <p className="font-medium">
                    Any blinds already cut or assembled stay done — carry them to the new
                    station.
                  </p>
                ) : toCarry === 0 ? (
                  <p className="font-medium">
                    Nothing built yet — there is nothing to carry over.
                  </p>
                ) : (
                  <>
                    <p className="font-medium">
                      {toCarry} blind{toCarry === 1 ? "" : "s"} already built — move the parts
                      to the new station.
                    </p>
                    <p className="mt-1 text-tertiary">
                      {inFlight! > 0 && (
                        <>
                          {inFlight} cut or assembled
                          {finished! > 0 ? ", " : ""}
                        </>
                      )}
                      {finished! > 0 && <>{finished} finished</>}
                      . All of it stays done — nothing is rebuilt.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted mb-3">
              Move to
            </p>
            <div className="flex flex-col gap-2">
              {destinations.length === 0 && (
                <p className="py-4 text-center text-[13px] text-muted">
                  No other station to move to.
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
                  <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center bg-emerald-100">
                    <Factory size={16} className="text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-[14px] font-medium text-foreground truncate">
                      {p.name}
                    </span>
                    <span className="block text-[11px] text-tertiary truncate">In-house station</span>
                  </div>
                  <ArrowRight size={16} className="text-tertiary shrink-0" />
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-tertiary leading-snug">
            Pinned dates and manual priority are cleared — the new station re-plans this unit
            against its own daily capacity.
          </p>

          {error && (
            <div className="rounded-[var(--radius-md)] border px-3.5 py-3 text-[13px] leading-snug font-medium bg-danger-light border-[rgba(200,57,43,0.2)] text-danger">
              {error}
            </div>
          )}

          <div className="pb-32">
            <Button fullWidth size="lg" disabled={!destinationId || pending} onClick={handleConfirm}>
              {pending ? "Moving…" : "Move unit"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
