"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarCheck, CheckCircle, X } from "@phosphor-icons/react";
import { assignUnitsToScheduler } from "@/app/actions/management-actions";
import { Button } from "@/components/ui/button";
import type { Scheduler } from "@/lib/types";

type Props = {
  unitIds: string[];
  schedulers: Scheduler[];
  onClose: () => void;
  onSuccess: () => void;
};

export function BulkAssignSchedulerSheet({
  unitIds,
  schedulers,
  onClose,
  onSuccess,
}: Props) {
  const [selectedSchedulerId, setSelectedSchedulerId] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    if (!selectedSchedulerId) return;
    setError("");
    startTransition(async () => {
      const result = await assignUnitsToScheduler(selectedSchedulerId, unitIds);
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
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30" onClick={onClose} />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="fixed bottom-0 left-0 right-0 z-40 bg-card rounded-t-[var(--radius-xl)] shadow-2xl max-h-[80dvh] overflow-y-auto"
      >
        <div className="px-4 pt-4 pb-2 flex items-center justify-between border-b border-border">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">Assign to Scheduler</h2>
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
              Choose a scheduler
            </p>
            <div className="flex flex-col gap-2">
              {schedulers.length === 0 && (
                <p className="py-4 text-center text-[13px] text-muted">
                  No schedulers found. Create one in Accounts first.
                </p>
              )}
              {schedulers.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSchedulerId(s.id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] border text-left transition-all active:scale-[0.98] ${
                    selectedSchedulerId === s.id
                      ? "border-accent bg-accent-light"
                      : "border-border bg-card hover:bg-surface"
                  }`}
                >
                  <div className="w-9 h-9 rounded-xl bg-sky-100 flex-shrink-0 flex items-center justify-center">
                    <CalendarCheck size={16} className="text-sky-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-[14px] font-medium text-foreground truncate">
                      {s.name}
                    </span>
                    <span className="block text-[11px] text-tertiary truncate">
                      {s.email}
                    </span>
                  </div>
                  {selectedSchedulerId === s.id && (
                    <CheckCircle size={18} weight="fill" className="text-accent flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="pb-32">
            {saved ? (
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center justify-center gap-2 h-13 rounded-xl bg-emerald-500 text-white font-semibold"
              >
                <CheckCircle size={20} weight="fill" />
                Assigned
              </motion.div>
            ) : (
              <Button
                fullWidth
                size="lg"
                disabled={!selectedSchedulerId || pending}
                onClick={handleSave}
              >
                {pending
                  ? "Assigning…"
                  : `Assign ${unitIds.length} Unit${unitIds.length !== 1 ? "s" : ""} to Scheduler`}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
