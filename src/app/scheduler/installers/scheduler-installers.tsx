"use client";

import { useState } from "react";
import { Plus } from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { InviteInstallerForm } from "@/components/installers/invite-installer-form";
import { InstallersList } from "@/components/installers/installers-list";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { RefreshButton } from "@/components/ui/refresh-button";

export function SchedulerInstallers({ data }: { data: AppDataset }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="flex flex-col pb-32">
      <PageHeader
        title="Installers"
        subtitle={`${data.installers.length} installer${data.installers.length === 1 ? "" : "s"}`}
        actions={
          <>
            <RefreshButton />
            <Button size="sm" onClick={() => setShowForm((value) => !value)}>
              <Plus size={14} weight="bold" />
              {showForm ? "Close" : "Invite"}
            </Button>
          </>
        }
      />

      <div className="px-4 pt-4 flex flex-col gap-3">
        {showForm && (
          <InviteInstallerForm
            onDone={() => {
              setShowForm(false);
              window.location.reload();
            }}
          />
        )}

        <InstallersList
          installers={data.installers}
          units={data.units}
          emptyMessage="No installers yet. Tap Invite to add one."
        />
      </div>
    </div>
  );
}
