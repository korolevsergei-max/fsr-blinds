"use client";

import { motion } from "framer-motion";
import { Buildings, CheckCircle, Envelope, Phone, UserCircle } from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ChangePasswordInline } from "@/components/ui/change-password-inline";

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
            <p className="text-[12px] text-tertiary">Installer</p>
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
  const linkedInstallers = installers.filter((installer) => Boolean(installer.authUserId));
  const orphanInstallers = installers.filter((installer) => !installer.authUserId);

  if (installers.length === 0) {
    return <div className="py-12 text-center text-sm text-muted">{emptyMessage}</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {linkedInstallers.map((installer, index) => {
        const assignedUnits = units.filter((unit) => unit.assignedInstallerId === installer.id);
        const activeUnits = assignedUnits.filter((unit) => unit.status !== "installed");
        const completedUnits = assignedUnits.filter((unit) => unit.status === "installed");

        return (
          <motion.div
            key={installer.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <InstallerCard
              installer={installer}
              activeUnits={activeUnits.length}
              completedUnits={completedUnits.length}
              showDelete={showDelete}
              deletePending={deletePending}
              onDelete={onDelete}
              showChangePassword={showChangePassword}
            />
          </motion.div>
        );
      })}

      {orphanInstallers.length > 0 && (
        <>
          <InlineAlert variant="error">
            Orphaned installer records (not linked to Supabase Auth): {orphanInstallers.length}.
            {showDelete ? " Use Delete to remove them." : " Ask the owner to clean them up."}
          </InlineAlert>
          {orphanInstallers.map((installer, index) => {
            const assignedUnits = units.filter((unit) => unit.assignedInstallerId === installer.id);
            const activeUnits = assignedUnits.filter((unit) => unit.status !== "installed");
            const completedUnits = assignedUnits.filter((unit) => unit.status === "installed");

            return (
              <motion.div
                key={installer.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: (linkedInstallers.length + index) * 0.06,
                  duration: 0.3,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <InstallerCard
                  installer={installer}
                  activeUnits={activeUnits.length}
                  completedUnits={completedUnits.length}
                  showDelete={showDelete}
                  deletePending={deletePending}
                  onDelete={onDelete}
                />
              </motion.div>
            );
          })}
        </>
      )}
    </div>
  );
}
