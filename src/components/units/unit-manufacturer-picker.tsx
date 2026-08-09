"use client";

import { useState, useTransition } from "react";
import { Factory } from "@phosphor-icons/react";

import { assignUnitsToManufacturingPartner } from "@/app/actions/management-actions";
import { useDatasetSelectorMaybe } from "@/lib/dataset-context";
import { INTERNAL_PARTNER_ID, sortPartners } from "@/lib/manufacturing-partners";
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
  partnerId,
  assignedAt,
  className = "flex items-center gap-3 px-4 py-3 border-b border-r border-border-subtle",
}: {
  unitId: string;
  partnerId: string | null | undefined;
  /** NULL = never chosen. Non-null makes this a *re*-assignment, which is owner-only. */
  assignedAt?: string | null;
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

  const current = optimisticId ?? partnerId ?? INTERNAL_PARTNER_ID;
  const currentName = partners.find((p) => p.id === current)?.name ?? current;

  if (partners.length === 0) return null;

  // Re-routing a unit mid-build moves real work between two companies, so once a
  // manufacturer has been set only the owner may change it. Schedulers still make
  // the initial choice via the room-creation gate. The DB trigger
  // `units_guard_ownership_columns` enforces the same rule underneath.
  const canEdit = role === "owner" || !assignedAt;
  if (!canEdit) {
    return (
      <div className={className}>
        <Factory size={17} className="text-tertiary shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] text-tertiary">Manufacturer</p>
          <p className="text-[13px] font-medium text-foreground truncate">{currentName}</p>
          <p className="text-[10px] text-tertiary">Owner can change this</p>
        </div>
      </div>
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
