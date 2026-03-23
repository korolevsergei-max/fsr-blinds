"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Plus,
  MapPin,
  Buildings as BuildingsIcon,
} from "@phosphor-icons/react";
import {
  clients,
  getBuildingsByClient,
  getUnitsByBuilding,
} from "@/lib/mock-data";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

export function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const client = clients.find((c) => c.id === id);

  if (!client) {
    return <div className="p-6 text-center text-muted">Client not found</div>;
  }

  const clientBuildings = getBuildingsByClient(client.id);

  return (
    <div className="flex flex-col">
      <PageHeader
        title={client.name}
        subtitle={`${client.contactName} \u2022 ${client.contactPhone}`}
        backHref="/management/clients"
        actions={
          <Button size="sm">
            <Plus size={14} weight="bold" />
            Building
          </Button>
        }
      />

      <div className="px-4 py-4 flex flex-col gap-3">
        {clientBuildings.map((building, i) => {
          const bUnits = getUnitsByBuilding(building.id);
          const activeUnits = bUnits.filter(
            (u) => u.status !== "client_approved"
          );
          const assignedInstallers = new Set(
            bUnits
              .filter((u) => u.assignedInstallerName)
              .map((u) => u.assignedInstallerName)
          );

          return (
            <motion.div
              key={building.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: i * 0.06,
                duration: 0.3,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <Link href={`/management/units?building=${building.id}`}>
                <div className="bg-white rounded-2xl border border-border p-4 hover:border-zinc-300 transition-all active:scale-[0.99]">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center">
                        <BuildingsIcon size={18} className="text-zinc-500" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-900 tracking-tight">
                          {building.name}
                        </h3>
                        <div className="flex items-center gap-1 text-xs text-muted mt-0.5">
                          <MapPin size={10} />
                          {building.address}
                        </div>
                      </div>
                    </div>
                    <ArrowRight size={16} className="text-zinc-400 mt-1" />
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted border-t border-border pt-3 mt-3">
                    <span>
                      <span className="font-mono font-semibold text-zinc-700">
                        {bUnits.length}
                      </span>{" "}
                      units
                    </span>
                    <span>
                      <span className="font-mono font-semibold text-accent">
                        {activeUnits.length}
                      </span>{" "}
                      active
                    </span>
                    <span>
                      <span className="font-mono font-semibold text-zinc-700">
                        {assignedInstallers.size}
                      </span>{" "}
                      installers
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
