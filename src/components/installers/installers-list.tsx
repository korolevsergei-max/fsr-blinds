"use client";

import { Buildings, CheckCircle, Envelope, Phone, UserCircle } from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ChangePasswordInline } from "@/components/ui/change-password-inline";
import { installerPickerCaption, isSchedulerAlias } from "@/lib/scheduler-installer-alias";

type InstallerRecord = AppDataset["installers"][number];

type InstallersListProps = {
  installers: AppDataset["installers"];
  units: AppDataset["units"];
  showDelete?: boolean;
  deletePending?: boolean;
  onDelete?: (installer: InstallerRecord) => void;
  emptyMessage?: string;
  showChangePassword?: boolean;
};

function InstallerCard({
  installer,
  activeUnits,
  completedUnits,
  showDelete = false,
  deletePending = false,
  onDelete,
  showChangePassword = false,
}: {
  installer: InstallerRecord;
  activeUnits: number;
  completedUnits: number;
  showDelete?: boolean;
  deletePending?: boolean;
  onDelete?: (installer: InstallerRecord) => void;
  showChangePassword?: boolean;
}) {
  return (
    <div className="surface-card p-4">
      <div className="flex items-center gap-3 mb-3 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[var(--radius-md)] bg-surface border border-border flex items-center justify-center">
            <UserCircle size={22} className="text-tertiary" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-foreground tracking-tight">
              {installer.name}
            </h3>
            <p className="text-[12px] text-tertiary">{installerPickerCaption(installer)}</p>
          </div>
        </div>
        {showDelete && onDelete && (
          <Button
            size="sm"
            variant="danger"
            disabled={deletePending}
            onClick={() => onDelete(installer)}
          >
            Delete
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1.5 mb-3">
        <div className="flex items-center gap-2 text-[12px] text-secondary">
          <Envelope size={12} />
          {installer.email}
        </div>
        <div className="flex items-center gap-2 text-[12px] text-secondary">
          <Phone size={12} />
          {installer.phone || "No phone"}
        </div>
      </div>

      <div className="flex items-center gap-4 text-[12px] text-tertiary border-t border-border-subtle pt-3">
        <span className="flex items-center gap-1">
          <Buildings size={12} />
          <span className="font-mono font-semibold text-foreground">{activeUnits}</span> active
        </span>
        <span className="flex items-center gap-1">
          <CheckCircle size={12} />
          <span className="font-mono font-semibold text-foreground">{completedUnits}</span>{" "}
          completed
        </span>
      </div>
      {showChangePassword && installer.authUserId && (
        <ChangePasswordInline authUserId={installer.authUserId} />
      )}
    </div>
  );
}

export function InstallersList({
  installers,
  units,
  showDelete = false,
  deletePending = false,
  onDelete,
  emptyMessage = "No installers added yet.",
  showChangePassword = false,
}: InstallersListProps) {
  // A scheduler-installer alias row has no auth link BY DESIGN (it is an assignment target,
  // never a login), so it must be split out before the orphan check — otherwise every one of
  // them lands under the "not linked to Supabase Auth" error. It also gets no Delete or
  // Change password: the row is maintained by a trigger on `schedulers`, and the person is
  // managed on the Schedulers tab. See docs/SCHEDULER_AS_INSTALLER.md.
  const aliasInstallers = installers.filter(isSchedulerAlias);
  const accountInstallers = installers.filter((installer) => !isSchedulerAlias(installer));
  const linkedInstallers = accountInstallers.filter((installer) => Boolean(installer.authUserId));
  const orphanInstallers = accountInstallers.filter((installer) => !installer.authUserId);

  if (installers.length === 0) {
    return <div className="py-12 text-center text-sm text-muted">{emptyMessage}</div>;
  }

  const renderCard = (
    installer: InstallerRecord,
    animIndex: number,
    cardProps: { showDelete: boolean; showChangePassword: boolean }
  ) => {
    const assignedUnits = units.filter((unit) => unit.assignedInstallerId === installer.id);
    const activeUnits = assignedUnits.filter((unit) => unit.status !== "installed");
    const completedUnits = assignedUnits.filter((unit) => unit.status === "installed");

    return (
      <div
        key={installer.id}
        className="animate-fade-up"
        style={{ '--anim-delay': `${animIndex * 0.06}s` } as React.CSSProperties}
      >
        <InstallerCard
          installer={installer}
          activeUnits={activeUnits.length}
          completedUnits={completedUnits.length}
          showDelete={cardProps.showDelete}
          deletePending={deletePending}
          onDelete={onDelete}
          showChangePassword={cardProps.showChangePassword}
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {linkedInstallers.map((installer, index) =>
        renderCard(installer, index, { showDelete, showChangePassword })
      )}

      {aliasInstallers.map((installer, index) =>
        renderCard(installer, linkedInstallers.length + index, {
          showDelete: false,
          showChangePassword: false,
        })
      )}

      {orphanInstallers.length > 0 && (
        <>
          <InlineAlert variant="error">
            Orphaned installer records (not linked to Supabase Auth): {orphanInstallers.length}.
            {showDelete ? " Use Delete to remove them." : " Ask the owner to clean them up."}
          </InlineAlert>
          {orphanInstallers.map((installer, index) =>
            renderCard(
              installer,
              linkedInstallers.length + aliasInstallers.length + index,
              { showDelete, showChangePassword: false }
            )
          )}
        </>
      )}
    </div>
  );
}
