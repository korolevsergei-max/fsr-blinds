"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle, UserCircle } from "@phosphor-icons/react";
import { units, installers } from "@/lib/mock-data";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { RiskBadge } from "@/components/ui/risk-badge";

export function AssignUnit() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const unit = units.find((u) => u.id === id);

  const [selectedInstaller, setSelectedInstaller] = useState(
    unit?.assignedInstallerId || ""
  );
  const [bracketingDate, setBracketingDate] = useState(
    unit?.bracketingDate || ""
  );
  const [installationDate, setInstallationDate] = useState(
    unit?.installationDate || ""
  );
  const [saved, setSaved] = useState(false);

  if (!unit) {
    return <div className="p-6 text-center text-muted">Unit not found</div>;
  }

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => router.push(`/management/units/${unit.id}`), 1200);
  };

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title="Assign & Schedule"
        subtitle={`${unit.unitNumber} \u2022 ${unit.buildingName}`}
        backHref={`/management/units/${unit.id}`}
      />

      <div className="flex-1 px-4 py-5 flex flex-col gap-6">
        {/* Current state */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-3"
        >
          <StatusChip status={unit.status} />
          <RiskBadge flag={unit.riskFlag} />
        </motion.div>

        {/* Select installer */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-xs font-medium text-muted uppercase tracking-widest mb-3">
            Assign Installer
          </h2>
          <div className="flex flex-col gap-2">
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
                  <img
                    src={inst.avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900">{inst.name}</p>
                  <p className="text-xs text-muted">{inst.phone}</p>
                </div>
                {selectedInstaller === inst.id && (
                  <CheckCircle
                    size={20}
                    weight="fill"
                    className="text-accent flex-shrink-0"
                  />
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
          />
          <Input
            label="Installation Target Date"
            type="date"
            value={installationDate}
            onChange={(e) => setInstallationDate(e.target.value)}
            helper="Optional, can be set later"
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
            <Button
              fullWidth
              size="lg"
              disabled={!selectedInstaller}
              onClick={handleSave}
            >
              Save Assignment
            </Button>
          )}
        </motion.div>
      </div>
    </div>
  );
}
