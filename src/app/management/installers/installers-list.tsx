"use client";

import { motion } from "framer-motion";
import { Envelope, Phone, Buildings, CheckCircle, Plus } from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

export function InstallersList({ data }: { data: AppDataset }) {
  const { installers, units } = data;

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Installers"
        actions={
          <Button size="sm">
            <Plus size={14} weight="bold" />
            Add
          </Button>
        }
      />

      <div className="px-4 py-4 flex flex-col gap-3">
        {installers.map((inst, i) => {
          const assignedUnits = units.filter(
            (u) => u.assignedInstallerId === inst.id
          );
          const activeUnits = assignedUnits.filter(
            (u) => u.status !== "client_approved"
          );
          const completedUnits = assignedUnits.filter(
            (u) => u.status === "client_approved"
          );

          return (
            <motion.div
              key={inst.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="surface-card p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-[var(--radius-lg)] overflow-hidden bg-surface border border-border flex-shrink-0">
                    <img
                      src={inst.avatarUrl}
                      alt={inst.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="text-[14px] font-semibold text-foreground tracking-tight">
                      {inst.name}
                    </h3>
                    <p className="text-[12px] text-tertiary">Field installer</p>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 mb-3">
                  <div className="flex items-center gap-2 text-[12px] text-secondary">
                    <Envelope size={12} />
                    {inst.email}
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-secondary">
                    <Phone size={12} />
                    {inst.phone}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-[12px] text-tertiary border-t border-border-subtle pt-3">
                  <span className="flex items-center gap-1">
                    <Buildings size={12} />
                    <span className="font-mono font-semibold text-foreground">
                      {activeUnits.length}
                    </span>{" "}
                    active
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle size={12} />
                    <span className="font-mono font-semibold text-foreground">
                      {completedUnits.length}
                    </span>{" "}
                    completed
                  </span>
                  <span>
                    <span className="font-mono font-semibold text-foreground">
                      {assignedUnits.length}
                    </span>{" "}
                    total
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
