"use client";

import { useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle } from "@phosphor-icons/react";
import { updateUnitAssignment } from "@/app/actions/fsr-data";
import type { AppDataset } from "@/lib/app-dataset";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { SectionLabel } from "@/components/ui/section-label";

export function AssignUnitScheduler({ data }: { data: AppDataset }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const unit = data.units.find((u) => u.id === id);
  const { installers } = data;

  const [selectedInstaller, setSelectedInstaller] = useState(unit?.assignedInstallerId ?? "");
  const [bracketingDate, setBracketingDate] = useState(unit?.bracketingDate ?? "");
  const [installationDate, setInstallationDate] = useState(unit?.installationDate ?? "");
  const [completeByDate, setCompleteByDate] = useState(unit?.completeByDate ?? "");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!unit) {
    return <div className="p-6 text-center text-muted">Unit not found</div>;
  }

  const handleSave = () => {
    setSaveError("");
    startTransition(async () => {
      const result = await updateUnitAssignment(
        unit.id,
        selectedInstaller,
        bracketingDate,
        installationDate,
        completeByDate
      );
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => router.push(`/scheduler/units/${unit.id}`), 900);
    });
  };

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title="Assign & Schedule"
        subtitle={`${unit.unitNumber} · ${unit.buildingName}`}
        backHref={`/scheduler/units/${unit.id}`}
      />

      <div className="flex-1 px-4 py-5 flex flex-col gap-6">
        {saveError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {saveError}
          </p>
        )}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-3"
        >
          <StatusChip status={unit.status} />
          <SectionLabel>Assignment & Dates</SectionLabel>
        </motion.div>

        {/* Select installer */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <SectionLabel>Assign installer</SectionLabel>
          <div className="flex flex-col gap-2">
            {installers.length === 0 && (
              <p className="text-[13px] text-muted py-4 text-center">
                No installers added yet. Ask the owner to invite one.
              </p>
            )}
            {installers.map((inst) => (
              <button
                key={inst.id}
                type="button"
                onClick={() => setSelectedInstaller(inst.id)}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all active:scale-[0.98] ${
                  selectedInstaller === inst.id
                    ? "border-accent bg-emerald-50"
                    : "border-border bg-white hover:bg-zinc-50"
                }`}
              >
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-zinc-200 flex-shrink-0">
                  <img src={inst.avatarUrl} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900">{inst.name}</p>
                  <p className="text-xs text-muted">{inst.phone}</p>
                </div>
                {selectedInstaller === inst.id && (
                  <CheckCircle size={20} weight="fill" className="text-accent flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Dates */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-4"
        >
          <Input
            label="Bracketing Date"
            type="date"
            value={bracketingDate}
            onChange={(e) => setBracketingDate(e.target.value)}
            helper="Setting this date automatically moves the unit to Scheduled for Bracketing"
          />
          <Input
            label="Installation Target Date"
            type="date"
            value={installationDate}
            onChange={(e) => setInstallationDate(e.target.value)}
            helper="Optional, can be set later"
          />
          <Input
            label="Complete By Date"
            type="date"
            value={completeByDate}
            onChange={(e) => setCompleteByDate(e.target.value)}
            helper="Optional deadline for completing unit work"
          />
        </motion.div>

        {/* Save */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="pt-2 pb-24"
        >
          {saved ? (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center justify-center gap-2 h-13 rounded-xl bg-emerald-500 text-white font-medium"
            >
              <CheckCircle size={20} weight="fill" />
              Assignment Saved
            </motion.div>
          ) : (
            <Button fullWidth size="lg" disabled={pending} onClick={handleSave}>
              {pending ? "Saving…" : "Save Assignment"}
            </Button>
          )}
        </motion.div>
      </div>
    </div>
  );
}
