"use client";

import { useState, useTransition } from "react";

import { CheckCircle, Factory, X } from "@phosphor-icons/react";
import { assignUnitsToManufacturingPartner } from "@/app/actions/management-actions";
import { Button } from "@/components/ui/button";
import { sortPartners } from "@/lib/manufacturing-partners";
import type { ManufacturingPartner } from "@/lib/types";

type Props = {
  unitIds: string[];
  partners: ManufacturingPartner[];
  onClose: () => void;
  onSuccess: () => void;
};

export function BulkAssignManufacturerSheet({
  unitIds,
  partners,
  onClose,
  onSuccess,
}: Props) {
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const ordered = sortPartners(partners);

  const handleSave = () => {
    if (!selectedPartnerId) return;
    setError("");
    startTransition(async () => {
      const result = await assignUnitsToManufacturingPartner(selectedPartnerId, unitIds);
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
              {unitIds.length} unit{unitIds.length !== 1 ? "s" : ""} selected
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
                      {p.isInternal ? "In-house factory" : p.contactEmail || "Subcontractor"}
                    </span>
                  </div>
                  {selectedPartnerId === p.id && (
                    <CheckCircle size={18} weight="fill" className="text-accent flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-tertiary mt-3 leading-snug">
              Units sent to a subcontractor leave the in-house cutting, assembly and QC
              queues, and stop taking up factory capacity.
            </p>
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
                disabled={!selectedPartnerId || pending}
                onClick={handleSave}
              >
                {pending
                  ? "Assigning…"
                  : `Assign ${unitIds.length} Unit${unitIds.length !== 1 ? "s" : ""}`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
