"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { motion } from "framer-motion";
import { Envelope, Phone, SignOut } from "@phosphor-icons/react";
import { getUnitsByInstaller } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import { PageHeader } from "@/components/ui/page-header";
import { MetricTile } from "@/components/ui/metric-tile";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/actions/auth-actions";

export function InstallerProfile({
  data,
  installerId = "inst-1",
}: {
  data: AppDataset;
  installerId?: string;
}) {
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();

  const installer =
    data.installers.find((i) => i.id === installerId) ?? data.installers[0];
  if (!installer) {
    return (
      <div className="p-6 text-center text-muted">No installer profile</div>
    );
  }
  const myUnits = getUnitsByInstaller(data, installer.id);
  const active = myUnits.filter((u) => u.status !== "installed").length;
  const completed = myUnits.filter((u) => u.status === "installed").length;

  return (
    <div className="flex flex-col">
      <PageHeader title="Profile" />

      <div className="px-5 py-6 flex flex-col gap-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-4"
        >
          <div className="w-16 h-16 rounded-[var(--radius-xl)] overflow-hidden bg-accent-light flex-shrink-0 flex items-center justify-center">
            <img
              src={installer.avatarUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">
              {installer.name}
            </h2>
            <p className="text-[12px] text-tertiary font-medium">Field installer</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="surface-card p-4 flex flex-col gap-3"
        >
          <div className="flex items-center gap-3 text-[14px] text-foreground">
            <Envelope size={15} className="text-accent" />
            {installer.email}
          </div>
          <div className="flex items-center gap-3 text-[14px] text-foreground">
            <Phone size={15} className="text-accent" />
            {installer.phone}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-2 gap-3"
        >
          <MetricTile value={active} label="Active Units" />
          <MetricTile value={completed} label="Completed" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="pt-4"
        >
          <Button
            variant="ghost"
            fullWidth
            disabled={signingOut}
            onClick={() =>
              startSignOut(async () => {
                await signOut();
                router.push("/login");
                router.refresh();
              })
            }
          >
            <SignOut size={16} />
            {signingOut ? "Signing out…" : "Sign Out"}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
