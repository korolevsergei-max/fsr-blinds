"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Plus, Envelope, Phone, Warning } from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineAlert } from "@/components/ui/inline-alert";
import { purgeAllClientData } from "@/app/actions/management-actions";
import { CONFIRM_PURGE_ALL_CLIENTS } from "@/lib/client-purge-constants";

export function ClientsList({ data }: { data: AppDataset }) {
  const { clients, buildings, units } = data;
  const [purgePhrase, setPurgePhrase] = useState("");
  const [purgeError, setPurgeError] = useState("");
  const [purgePending, startPurge] = useTransition();

  const runPurge = () => {
    if (
      !window.confirm(
        "This permanently deletes every client, building, unit, room, window, schedule entry, and related database records. Installers and accounts are kept. Continue?"
      )
    ) {
      return;
    }
    setPurgeError("");
    startPurge(async () => {
      const result = await purgeAllClientData(purgePhrase);
      if (!result.ok) {
        setPurgeError(result.error);
        return;
      }
      setPurgePhrase("");
      window.location.reload();
    });
  };

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
                <div className="surface-card p-4 hover:shadow-[var(--shadow-md)] transition-all duration-200 active:scale-[0.99]">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-[14px] font-semibold text-foreground tracking-tight">
                      {client.name}
                    </h3>
                    <ArrowRight size={15} className="text-tertiary mt-0.5" />
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

        <div className="mt-6 pt-6 border-t border-border-subtle flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-danger">
            <Warning size={14} weight="fill" />
            Danger zone
          </div>
          <p className="text-[12px] text-secondary leading-relaxed">
            Remove all client-linked project data to start fresh. Accounts (installers, schedulers,
            manufacturers) stay; clear orphaned storage objects in Supabase if you use uploads.
          </p>
          <Input
            label={`Type "${CONFIRM_PURGE_ALL_CLIENTS}" to enable reset`}
            value={purgePhrase}
            onChange={(e) => {
              setPurgePhrase(e.target.value);
              if (purgeError) setPurgeError("");
            }}
            placeholder={CONFIRM_PURGE_ALL_CLIENTS}
            autoComplete="off"
          />
          {purgeError && <InlineAlert variant="error">{purgeError}</InlineAlert>}
          <Button
            size="sm"
            variant="danger"
            disabled={purgePending || purgePhrase.trim() !== CONFIRM_PURGE_ALL_CLIENTS}
            onClick={runPurge}
          >
            {purgePending ? "Removing…" : "Delete all client data"}
          </Button>
        </div>
      </div>
    </div>
  );
}
