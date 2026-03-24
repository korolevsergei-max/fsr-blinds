"use client";

import { useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle, ArrowRight } from "@phosphor-icons/react";
import { updateUnitStatus } from "@/app/actions/fsr-data";
import { getRoomsByUnit } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import {
  UNIT_STATUSES,
  UNIT_STATUS_LABELS,
  UNIT_STATUS_ORDER,
} from "@/lib/types";
import type { UnitStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { MetricTile } from "@/components/ui/metric-tile";
import { Button } from "@/components/ui/button";

export function StatusUpdate({ data }: { data: AppDataset }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const unit = data.units.find((u) => u.id === id);
  const rooms = unit ? getRoomsByUnit(data, unit.id) : [];

  const [selectedStatus, setSelectedStatus] = useState<UnitStatus | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!unit) {
    return <div className="p-6 text-center text-muted">Unit not found</div>;
  }

  const currentStep = UNIT_STATUS_ORDER[unit.status];

  const allowedNext = UNIT_STATUSES.filter(
    (s) => UNIT_STATUS_ORDER[s] === currentStep + 1
  );

  const handleSave = () => {
    if (!selectedStatus) return;
    setSaveError("");
    startTransition(async () => {
      const result = await updateUnitStatus(unit.id, selectedStatus, note);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => router.push(`/installer/units/${unit.id}`), 900);
    });
  };

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title="Update Status"
        subtitle={`${unit.unitNumber} • ${unit.buildingName}`}
        backHref={`/installer/units/${unit.id}`}
      />

      <div className="flex-1 px-5 py-5 flex flex-col gap-6">
        {saveError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            {saveError}
          </p>
        )}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-3">
            Current Status
          </h2>
          <div className="flex items-center gap-3 bg-white rounded-2xl border border-border px-4 py-3.5">
            <div className="w-2.5 h-2.5 rounded-full bg-accent" />
            <span className="text-sm font-bold text-foreground">
              {UNIT_STATUS_LABELS[unit.status]}
            </span>
          </div>
        </motion.div>

        {unit.status === "scheduled_bracketing" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-3">
              Completion Summary
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <MetricTile value={rooms.length} label="Rooms" />
              <MetricTile value={unit.windowCount} label="Windows" />
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-3">
            Move To
          </h2>
          <div className="flex flex-col gap-2">
            {allowedNext.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setSelectedStatus(status)}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-sm font-semibold transition-all active:scale-[0.98] ${
                  selectedStatus === status
                    ? "border-accent bg-accent/5 text-accent"
                    : "border-border bg-white text-zinc-700 hover:bg-surface"
                }`}
              >
                <ArrowRight size={16} />
                {UNIT_STATUS_LABELS[status]}
              </button>
            ))}

            {allowedNext.length === 0 && (
              <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-accent/5 border border-accent/20 text-accent text-sm font-semibold">
                <CheckCircle size={18} weight="fill" />
                Unit has reached final status
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">
            Status Note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add context for this status change..."
            rows={3}
            className="w-full px-4 py-3 rounded-2xl border border-border text-sm text-foreground bg-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all resize-none"
          />
        </motion.div>

        <div className="pt-2 pb-24">
          {saved ? (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center justify-center gap-2 h-13 rounded-2xl bg-accent text-white font-semibold"
            >
              <CheckCircle size={20} weight="fill" />
              Status Updated
            </motion.div>
          ) : (
            <Button
              fullWidth
              size="lg"
              disabled={!selectedStatus || pending}
              onClick={handleSave}
            >
              {pending ? "Saving…" : "Confirm Status Update"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
