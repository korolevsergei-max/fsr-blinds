"use client";

import { useState, useTransition } from "react";
import { Factory } from "@phosphor-icons/react";

import { assignUnitsToManufacturingPartner } from "@/app/actions/management-actions";
import { useDatasetSelectorMaybe } from "@/lib/dataset-context";
import { INTERNAL_PARTNER_ID, sortPartners } from "@/lib/manufacturing-partners";
import { manufacturingLockReason } from "@/lib/manufacturing-lock";
import { ManufacturerTransferDialog } from "@/components/units/manufacturer-transfer-dialog";
import { EDITABLE_VALUE } from "@/components/units/editable-cell-styles";

/**
 * Single-unit manufacturer control for the owner/scheduler unit detail page.
 *
 * The bulk equivalent lives in `bulk-assign-manufacturer-sheet.tsx`; both call the
 * same action, which reflows the internal factory schedule so the unit enters or
 * leaves the in-house queues.
 */
export function UnitManufacturerPicker({
  unitId,
  unitNumber,
  partnerId,
  assignedAt,
  locked = false,
  startedCount,
  qcApprovedCount,
  className = "flex items-center gap-3 px-4 py-3 border-b border-r border-border-subtle",
}: {
  unitId: string;
  /** Needed only for the owner's transfer confirmation. */
  unitNumber?: string;
  partnerId: string | null | undefined;
  /** NULL = never chosen. Non-null makes this a *re*-assignment, which is owner-only. */
  assignedAt?: string | null;
  /**
   * Manufacturing has started, so the DB trigger will reject a plain change.
   * Defaults to false on purpose: if a dataset ever ships without the field the
   * control stays usable and the server rejects a bad write, rather than every
   * unit silently freezing.
   */
  locked?: boolean;
  startedCount?: number;
  qcApprovedCount?: number;
  /** Wrapper classes — defaults to a cell of the unit-detail 2-column grid. */
  className?: string;
}) {
  const partners = useDatasetSelectorMaybe((value) => value.data.manufacturingPartners) ?? [];
  const role = useDatasetSelectorMaybe((value) => value.user.role);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  // Optimistic: the dataset store catches up on the next refresh, but the select
  // must not snap back to the old value while the reflow runs in after().
  const [optimisticId, setOptimisticId] = useState<string | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);

  const current = optimisticId ?? partnerId ?? INTERNAL_PARTNER_ID;
  const currentPartner = partners.find((p) => p.id === current);
  const currentName = currentPartner?.name ?? current;

  if (partners.length === 0) return null;

  // Two separate rules, and they stack:
  //   assignedAt — someone has chosen, so re-routing is owner-only.
  //   locked     — manufacturing has started, so nobody may change it silently;
  //                the owner has to go through the transfer confirmation, which
  //                spells out how many blinds get rebuilt.
  // `units_guard_ownership_columns` enforces both underneath; this is the
  // readable layer.
  const canEdit = (role === "owner" || !assignedAt) && !locked;
  if (!canEdit) {
    const lockReason = locked
      ? manufacturingLockReason(currentName, currentPartner?.isInternal ?? true, {
          startedCount: startedCount ?? 0,
          qcApprovedCount: qcApprovedCount ?? 0,
        })
      : "Owner can change this";
    return (
      <>
        <div className={className}>
          <Factory size={17} className="text-tertiary shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-tertiary">Manufacturer</p>
            <p className="text-[13px] font-medium text-foreground truncate">{currentName}</p>
            <p className="text-[10px] text-tertiary">{lockReason}</p>
            {/* The escape hatch is owner-only and deliberately understated — it
                should be findable when a unit is genuinely mis-routed, not
                inviting enough to click past the warning. */}
            {locked && role === "owner" && unitNumber && (
              <button
                type="button"
                onClick={() => setShowTransfer(true)}
                className="mt-1 text-[10px] font-medium text-danger underline underline-offset-2 hover:opacity-80"
              >
                Transfer anyway
              </button>
            )}
          </div>
        </div>
        {showTransfer && unitNumber && (
          <ManufacturerTransferDialog
            unitId={unitId}
            unitNumber={unitNumber}
            currentPartnerId={current}
            partners={partners}
            startedCount={startedCount}
            qcApprovedCount={qcApprovedCount}
            onClose={() => setShowTransfer(false)}
            onSuccess={(next) => setOptimisticId(next)}
          />
        )}
      </>
    );
  }

  const handleChange = (next: string) => {
    if (next === current) return;
    const previous = current;
    setOptimisticId(next);
    setError("");
    startTransition(async () => {
      const result = await assignUnitsToManufacturingPartner(next, [unitId]);
      if (!result.ok) {
        setOptimisticId(previous);
        setError(result.error);
      }
    });
  };

  return (
    <div className={className}>
      {/* Accent icon only on the editable branch — the read-only branch above keeps the
          neutral tone so "Owner can change this" reads as genuinely not actionable. */}
      <Factory size={17} className="text-accent shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-tertiary">Manufacturer</p>
        <select
          value={current}
          disabled={pending}
          onChange={(e) => handleChange(e.target.value)}
          className={`-ml-0.5 w-full bg-transparent text-[13px] truncate focus:outline-none focus:ring-2 focus:ring-accent rounded disabled:opacity-60 ${EDITABLE_VALUE}`}
        >
          {sortPartners(partners).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {error && <p className="text-[11px] text-danger mt-0.5">{error}</p>}
      </div>
    </div>
  );
}
