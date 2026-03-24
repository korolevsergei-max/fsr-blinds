"use client";

import { motion } from "framer-motion";
import {
  Envelope,
  Phone,
  Buildings,
  CheckCircle,
} from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "@phosphor-icons/react";

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
              transition={{
                delay: i * 0.08,
                duration: 0.3,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <div className="bg-white rounded-2xl border border-border p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-200 flex-shrink-0">
                    <img
                      src={inst.avatarUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 tracking-tight">
                      {inst.name}
                    </h3>
                    <p className="text-xs text-muted">Field Installer</p>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 mb-3">
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <Envelope size={12} />
                    {inst.email}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <Phone size={12} />
                    {inst.phone}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted border-t border-border pt-3">
                  <span className="flex items-center gap-1">
                    <Buildings size={12} />
                    <span className="font-mono font-semibold text-zinc-700">
                      {activeUnits.length}
                    </span>{" "}
                    active
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle size={12} />
                    <span className="font-mono font-semibold text-zinc-700">
                      {completedUnits.length}
                    </span>{" "}
                    completed
                  </span>
                  <span>
                    <span className="font-mono font-semibold text-zinc-700">
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
