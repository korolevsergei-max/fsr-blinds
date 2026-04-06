"use client";

import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarBlank, CheckCircle, Users, X } from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { bulkAssignUnits } from "@/app/actions/fsr-data";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { SectionLabel } from "@/components/ui/section-label";

type BulkAssignSheetProps = {
  unitIds: string[];
  installers: AppDataset["installers"];
  onClose: () => void;
  onSuccess: () => void;
  showCompleteBy?: boolean;
  /** Dates-only sheet (no installer picker) — used from “Set dates” bulk action. */
  variant?: "assign" | "datesOnly";
};

export function BulkAssignSheet({
  unitIds,
  installers,
  onClose,
  onSuccess,
  showCompleteBy = false,
  variant = "assign",
}: BulkAssignSheetProps) {
  const datesOnly = variant === "datesOnly";
  const [selectedInstaller, setSelectedInstaller] = useState("");
  const [measurementDate, setMeasurementDate] = useState("");
  const [bracketingDate, setBracketingDate] = useState("");
  const [installationDate, setInstallationDate] = useState("");
  const [completeByDate, setCompleteByDate] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const assignees = useMemo(
    () => installers.filter((installer) => Boolean(installer.id)),
    [installers]
  );
  const validInstallerIds = useMemo(
    () => new Set(assignees.map((installer) => installer.id)),
    [assignees]
  );
  const hasValidSelectedInstaller = selectedInstaller
    ? validInstallerIds.has(selectedInstaller)
    : false;

  if (selectedInstaller && !validInstallerIds.has(selectedInstaller)) {
    setSelectedInstaller("");
  }

  const handleSave = () => {
    if (!selectedInstaller && !measurementDate && !bracketingDate && !installationDate && (!showCompleteBy || !completeByDate)) return;

    setError("");
    startTransition(async () => {
      const result = await bulkAssignUnits(
        unitIds,
        hasValidSelectedInstaller ? selectedInstaller : "",
        bracketingDate,
        installationDate,
        undefined,
        measurementDate,
        showCompleteBy ? completeByDate : undefined
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
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30" onClick={onClose} />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="fixed bottom-0 left-0 right-0 z-40 bg-card rounded-t-[var(--radius-xl)] shadow-2xl max-h-[85dvh] overflow-y-auto"
      >
        <div className="px-4 pt-4 pb-2 flex items-center justify-between border-b border-border">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">
              {datesOnly ? "Set Dates" : "Bulk assign"}
            </h2>
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

        <div className="px-4 py-5 flex flex-col gap-6">
          {error && (
            <div className="rounded-[var(--radius-md)] border px-3.5 py-3 text-[13px] leading-snug font-medium bg-danger-light border-[rgba(200,57,43,0.2)] text-danger">
              {error}
            </div>
          )}

          {!datesOnly && (
            <div>
              <SectionLabel className="flex items-center gap-1.5">
                <Users size={13} className="inline" />
                Assign installer
              </SectionLabel>
              <div className="flex flex-col gap-2">
                {assignees.length === 0 && (
                  <p className="py-4 text-center text-[13px] text-muted">
                    No installers are available yet. Add one before assigning units.
                  </p>
                )}
                {assignees.map((assignee) => (
                  <button
                    key={`installer-${assignee.id}`}
                    type="button"
                    onClick={() => setSelectedInstaller(assignee.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] border text-left transition-all active:scale-[0.98] ${
                      selectedInstaller === assignee.id
                        ? "border-accent bg-accent-light"
                        : "border-border bg-card hover:bg-surface"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-xl bg-zinc-200 flex-shrink-0 flex items-center justify-center text-[11px] font-semibold text-zinc-700">
                      {assignee.name.startsWith("SC: ")
                        ? "SC"
                        : assignee.name
                          .split(" ")
                          .filter(Boolean)
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block text-[14px] font-medium text-foreground truncate">
                        {assignee.name}
                      </span>
                      <span className="block text-[11px] text-tertiary">
                        {assignee.name.startsWith("SC: ") ? "Scheduler" : "Installer"}
                      </span>
                    </div>
                    {selectedInstaller === assignee.id && (
                      <CheckCircle size={18} weight="fill" className="text-accent flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <SectionLabel className="flex items-center gap-1.5">
              <CalendarBlank size={13} className="inline" />
              {datesOnly ? "Schedule & deadlines" : "Dates (optional)"}
            </SectionLabel>
            <div className="flex flex-col gap-3">
              <DateInput
                label="Measurement Date"
                value={measurementDate}
                onChange={setMeasurementDate}
              />
              <DateInput
                label="Bracketing Date"
                value={bracketingDate}
                onChange={setBracketingDate}
              />
              <DateInput
                label="Installation Date"
                value={installationDate}
                onChange={setInstallationDate}
              />
              {showCompleteBy && (
                <DateInput
                  label="Complete by"
                  value={completeByDate}
                  onChange={setCompleteByDate}
                />
              )}
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
                {datesOnly ? "Dates saved" : "Assigned"}
              </motion.div>
            ) : (
              <Button
                fullWidth
                size="lg"
                disabled={
                  (!hasValidSelectedInstaller &&
                    !measurementDate &&
                    !bracketingDate &&
                    !installationDate &&
                    (!showCompleteBy || !completeByDate)) ||
                  pending
                }
                onClick={handleSave}
              >
                {pending
                  ? "Saving…"
                  : datesOnly
                    ? `Save dates for ${unitIds.length} unit${unitIds.length !== 1 ? "s" : ""}`
                    : !hasValidSelectedInstaller
                      ? `Update ${unitIds.length} Unit${unitIds.length !== 1 ? "s" : ""}`
                      : `Assign ${unitIds.length} Unit${unitIds.length !== 1 ? "s" : ""}`}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
