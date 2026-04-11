"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Plus, Envelope, Phone } from "@phosphor-icons/react";
import type { Building, Client, Unit } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

export function ClientsList({
  clients,
  buildings,
  units,
}: {
  clients: Client[];
  buildings: Building[];
  units: Unit[];
}) {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Clients"
        actions={
          <Link href="/management/clients/new">
            <Button size="sm">
              <Plus size={14} weight="bold" />
              Add
            </Button>
          </Link>
        }
      />

      <div className="px-4 py-4 flex flex-col gap-3">
        {clients.length === 0 && (
          <p className="text-center text-[13px] text-tertiary py-8">
            No clients yet. Add one to get started.
          </p>
        )}
        {clients.map((client, i) => {
          const clientBuildings = buildings.filter(
            (b) => b.clientId === client.id
          );
          const clientUnits = units.filter((u) => u.clientId === client.id);
          const activeUnits = clientUnits.filter(
            (u) => u.status !== "installed"
          );

          return (
            <motion.div
              key={client.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link href={`/management/clients/${client.id}`}>
                <div className="surface-card group p-4 hover:shadow-[var(--shadow-md)] transition-all duration-200 active:scale-[0.99]">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-[14px] font-semibold text-foreground tracking-tight">
                      {client.name}
                    </h3>
                    <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center -mr-1 shadow-sm group-hover:shadow-md transition-shadow">
                      <ArrowRight size={16} weight="bold" className="text-white" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 mb-3">
                    <div className="flex items-center gap-2 text-[12px] text-secondary">
                      <Envelope size={12} />
                      {client.contactEmail}
                    </div>
                    <div className="flex items-center gap-2 text-[12px] text-secondary">
                      <Phone size={12} />
                      {client.contactPhone}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-[12px] text-tertiary border-t border-border-subtle pt-3">
                    <span>
                      <span className="font-mono font-semibold text-foreground">
                        {clientBuildings.length}
                      </span>{" "}
                      buildings
                    </span>
                    <span>
                      <span className="font-mono font-semibold text-foreground">
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
