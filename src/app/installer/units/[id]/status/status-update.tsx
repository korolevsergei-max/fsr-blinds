"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle, ArrowRight, Door, Ruler } from "@phosphor-icons/react";
import { units, getRoomsByUnit } from "@/lib/mock-data";
import {
  UNIT_STATUSES,
  UNIT_STATUS_LABELS,
  UNIT_STATUS_ORDER,
} from "@/lib/types";
import type { UnitStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

export function StatusUpdate() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const unit = units.find((u) => u.id === id);
  const rooms = unit ? getRoomsByUnit(unit.id) : [];

  const [selectedStatus, setSelectedStatus] = useState<UnitStatus | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  if (!unit) {
    return <div className="p-6 text-center text-muted">Unit not found</div>;
  }

  const currentStep = UNIT_STATUS_ORDER[unit.status];

  const allowedNext = UNIT_STATUSES.filter(
    (s) => UNIT_STATUS_ORDER[s] === currentStep + 1
  );

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => router.push(`/installer/units/${unit.id}`), 1200);
  };

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title="Update Status"
        subtitle={`${unit.unitNumber} \u2022 ${unit.buildingName}`}
        backHref={`/installer/units/${unit.id}`}
      />

      <div className="flex-1 px-4 py-5 flex flex-col gap-6">
        {/* Current status */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-xs font-medium text-muted uppercase tracking-widest mb-3">
            Current Status
          </h2>
          <div className="flex items-center gap-3 bg-white rounded-xl border border-border px-4 py-3">
            <div className="w-2.5 h-2.5 rounded-full bg-accent" />
            <span className="text-sm font-semibold text-zinc-900">
              {UNIT_STATUS_LABELS[unit.status]}
            </span>
          </div>
        </motion.div>

        {/* Summary for bracketed status */}
        {unit.status === "scheduled_bracketing" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="text-xs font-medium text-muted uppercase tracking-widest mb-3">
              Completion Summary
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-border p-3.5 flex items-center gap-3">
                <Door size={18} className="text-zinc-400" />
                <div>
                  <p className="text-base font-semibold text-zinc-900 font-mono">
                    {rooms.length}
                  </p>
                  <p className="text-xs text-muted">Rooms</p>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-border p-3.5 flex items-center gap-3">
                <Ruler size={18} className="text-zinc-400" />
                <div>
                  <p className="text-base font-semibold text-zinc-900 font-mono">
                    {unit.windowCount}
                  </p>
                  <p className="text-xs text-muted">Windows</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Next status */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-xs font-medium text-muted uppercase tracking-widest mb-3">
            Move To
          </h2>
          <div className="flex flex-col gap-2">
            {allowedNext.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setSelectedStatus(status)}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border text-sm font-medium transition-all active:scale-[0.98] ${
                  selectedStatus === status
                    ? "border-accent bg-emerald-50 text-emerald-700"
                    : "border-border bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                <ArrowRight size={16} />
                {UNIT_STATUS_LABELS[status]}
              </button>
            ))}

            {allowedNext.length === 0 && (
              <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
                <CheckCircle size={18} weight="fill" />
                Unit has reached final status
              </div>
            )}
          </div>
        </motion.div>

        {/* Note */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <label className="text-sm font-medium text-zinc-700 tracking-tight mb-1.5 block">
            Status Note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add context for this status change..."
            rows={3}
            className="w-full px-3.5 py-3 rounded-xl border border-border text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all resize-none"
          />
        </motion.div>

        {/* Save */}
        <div className="pt-2 pb-24">
          {saved ? (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center justify-center gap-2 h-13 rounded-xl bg-emerald-500 text-white font-medium"
            >
              <CheckCircle size={20} weight="fill" />
              Status Updated
            </motion.div>
          ) : (
            <Button
              fullWidth
              size="lg"
              disabled={!selectedStatus}
              onClick={handleSave}
            >
              Confirm Status Update
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
