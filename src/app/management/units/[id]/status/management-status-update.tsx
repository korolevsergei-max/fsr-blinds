"use client";

import { useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle, Circle, Warning, Stamp } from "@phosphor-icons/react";
import { approveUnit } from "@/app/actions/fsr-data";
import type { AppDataset } from "@/lib/app-dataset";
import { UNIT_STATUSES, UNIT_STATUS_LABELS, UNIT_STATUS_ORDER } from "@/lib/types";
import type { UnitStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

export function ManagementStatusUpdate({
  data,
}: {
  data: AppDataset;
  mediaItems?: unknown;
}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const unit = data.units.find((u) => u.id === id);

  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!unit) {
    return <div className="p-6 text-center text-muted">Unit not found</div>;
  }

  const currentStep = UNIT_STATUS_ORDER[unit.status as UnitStatus] ?? 0;
  const canApprove = unit.status === "installed";

  const handleApprove = () => {
    setSaveError("");
    startTransition(async () => {
      const result = await approveUnit(unit.id);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => router.push(`/management/units/${unit.id}`), 900);
    });
  };

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title="Unit Progress"
        subtitle={`${unit.unitNumber} • ${unit.buildingName}`}
        backHref={`/management/units/${unit.id}`}
      />

      <div className="flex-1 px-4 py-5 flex flex-col gap-6">
        {saveError && (
          <div className="rounded-[var(--radius-md)] border px-3.5 py-3 text-[13px] font-medium bg-danger-light border-[rgba(200,57,43,0.2)] text-danger">
            {saveError}
          </div>
        )}

        {/* Current status */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-3">
            Current Status
          </h2>
          <div className="flex items-center gap-3 surface-card px-4 py-3.5">
            <div className="w-2.5 h-2.5 rounded-full bg-accent" />
            <span className="text-[14px] font-bold text-foreground">
              {UNIT_STATUS_LABELS[unit.status as UnitStatus] ?? unit.status}
            </span>
          </div>
        </motion.div>

        {/* Progress timeline */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-3">
            Progress Timeline
          </h2>
          <div className="flex flex-col">
            {UNIT_STATUSES.map((status, i) => {
              const step = UNIT_STATUS_ORDER[status];
              const isComplete = step < currentStep;
              const isCurrent = step === currentStep;
              return (
                <div key={status} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    {isComplete ? (
                      <CheckCircle size={18} weight="fill" className="text-emerald-500" />
                    ) : isCurrent ? (
                      <div className="w-[18px] h-[18px] rounded-full bg-accent flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    ) : (
                      <Circle size={18} className="text-zinc-300" />
                    )}
                    {i < UNIT_STATUSES.length - 1 && (
                      <div className={`w-px h-5 ${isComplete ? "bg-emerald-300" : "bg-zinc-200"}`} />
                    )}
                  </div>
                  <span
                    className={`text-[12px] pb-4 ${
                      isCurrent
                        ? "font-semibold text-foreground"
                        : isComplete
                          ? "text-secondary"
                          : "text-tertiary"
                    }`}
                  >
                    {UNIT_STATUS_LABELS[status]}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Approve section */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-3">
            Owner Approval
          </h2>

          {!canApprove && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-zinc-50 border border-border">
              <Warning size={16} weight="fill" className="text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-[12px] text-secondary leading-relaxed">
                Unit must reach <span className="font-semibold text-foreground">Installed</span> status before it can be approved. Status advances automatically as the installer uploads photos for each window.
              </p>
            </div>
          )}

          {canApprove && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 mb-4">
              <CheckCircle size={16} weight="fill" className="text-emerald-500 mt-0.5 flex-shrink-0" />
              <p className="text-[12px] text-emerald-700 font-medium leading-relaxed">
                All windows are installed. This unit is ready for your approval.
              </p>
            </div>
          )}
        </motion.div>

        <div className="pt-2 pb-24">
          {saved ? (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center justify-center gap-2 h-13 rounded-2xl bg-accent text-white font-semibold"
            >
              <CheckCircle size={20} weight="fill" />
              Unit Approved
            </motion.div>
          ) : (
            <Button
              fullWidth
              size="lg"
              disabled={!canApprove || pending}
              onClick={handleApprove}
            >
              <Stamp size={18} weight="bold" />
              {pending ? "Approving…" : "Approve Unit"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
