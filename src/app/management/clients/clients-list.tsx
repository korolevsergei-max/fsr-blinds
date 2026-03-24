"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Plus, Envelope, Phone } from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

export function ClientsList({ data }: { data: AppDataset }) {
  const { clients, buildings, units } = data;
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Clients"
        actions={
          <Button size="sm">
            <Plus size={14} weight="bold" />
            Add
          </Button>
        }
      />

      <div className="px-4 py-4 flex flex-col gap-3">
        {clients.map((client, i) => {
          const clientBuildings = buildings.filter(
            (b) => b.clientId === client.id
          );
          const clientUnits = units.filter((u) => u.clientId === client.id);
          const activeUnits = clientUnits.filter(
            (u) => u.status !== "client_approved"
          );

          return (
            <motion.div
              key={client.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: i * 0.06,
                duration: 0.3,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <Link href={`/management/clients/${client.id}`}>
                <div className="bg-white rounded-2xl border border-border p-4 hover:border-zinc-300 transition-all active:scale-[0.99]">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-sm font-semibold text-zinc-900 tracking-tight">
                      {client.name}
                    </h3>
                    <ArrowRight size={16} className="text-zinc-400 mt-0.5" />
                  </div>

                  <div className="flex flex-col gap-1.5 mb-3">
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <Envelope size={12} />
                      {client.contactEmail}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <Phone size={12} />
                      {client.contactPhone}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted border-t border-border pt-3">
                    <span>
                      <span className="font-mono font-semibold text-zinc-700">
                        {clientBuildings.length}
                      </span>{" "}
                      buildings
                    </span>
                    <span>
                      <span className="font-mono font-semibold text-zinc-700">
                        {clientUnits.length}
                      </span>{" "}
                      units
                    </span>
                    <span>
                      <span className="font-mono font-semibold text-accent">
                        {activeUnits.length}
                      </span>{" "}
                      active
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
