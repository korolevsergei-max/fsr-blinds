"use client";

import { useState, useTransition } from "react";
import { Warning } from "@phosphor-icons/react";
import { purgeAllClientData, backfillInstalledWindowProductionStatus } from "@/app/actions/management-actions";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Input } from "@/components/ui/input";
import { CONFIRM_PURGE_ALL_CLIENTS } from "@/lib/client-purge-constants";

export function DataManagementSection() {
  const [purgePhrase, setPurgePhrase] = useState("");
  const [purgeError, setPurgeError] = useState("");
  const [purgePending, startPurge] = useTransition();

  const [backfillMessage, setBackfillMessage] = useState("");
  const [backfillPending, startBackfill] = useTransition();

  const runBackfill = () => {
    setBackfillMessage("");
    startBackfill(async () => {
      const result = await backfillInstalledWindowProductionStatus();
      if (!result.ok) {
        setBackfillMessage(`Error: ${result.error}`);
        return;
      }
      setBackfillMessage(
        result.updatedCount === 0
          ? "All windows already up to date — nothing to backfill."
          : `Done. Marked ${result.updatedCount} window${result.updatedCount !== 1 ? "s" : ""} as built.`
      );
    });
  };

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
    <section className="rounded-2xl border border-border bg-card p-4 space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground">Backfill built status for installed units</p>
        <p className="text-xs leading-relaxed text-secondary">
          Marks all windows in installed (and manufactured) units as fully built (QC approved) if
          they are not already. Safe to run multiple times.
        </p>
        {backfillMessage && (
          <InlineAlert variant={backfillMessage.startsWith("Error") ? "error" : "success"}>
            {backfillMessage}
          </InlineAlert>
        )}
        <Button size="sm" variant="secondary" disabled={backfillPending} onClick={runBackfill}>
          {backfillPending ? "Running…" : "Backfill built status"}
        </Button>
      </div>

      <hr className="border-border" />

      <div>
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-danger">
          <Warning size={14} weight="fill" />
          Danger zone
        </div>
        <p className="mt-3 text-sm font-semibold text-foreground">
          Delete client-linked project data
        </p>
        <p className="mt-2 text-xs leading-relaxed text-secondary">
          Remove all client-linked project data to start fresh. Accounts for installers,
          schedulers, cutters, assemblers, and owners stay in place. If you use uploads, clear
          orphaned storage objects in Supabase separately.
        </p>
      </div>

      <Input
        label={`Type "${CONFIRM_PURGE_ALL_CLIENTS}" to enable reset`}
        value={purgePhrase}
        onChange={(event) => {
          setPurgePhrase(event.target.value);
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
    </section>
  );
}
