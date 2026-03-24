"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Envelope,
  Phone,
  SignOut,
} from "@phosphor-icons/react";
import { getUnitsByInstaller } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import { PageHeader } from "@/components/ui/page-header";
import { MetricTile } from "@/components/ui/metric-tile";
import { Button } from "@/components/ui/button";

export function InstallerProfile({
  data,
  installerId = "inst-1",
}: {
  data: AppDataset;
  installerId?: string;
}) {
  const installer =
    data.installers.find((i) => i.id === installerId) ?? data.installers[0];
  if (!installer) {
    return (
      <div className="p-6 text-center text-muted">No installer profile</div>
    );
  }
  const myUnits = getUnitsByInstaller(data, installer.id);
  const active = myUnits.filter((u) => u.status !== "client_approved").length;
  const completed = myUnits.filter((u) => u.status === "client_approved").length;

  return (
    <div className="flex flex-col">
      <PageHeader title="Profile" />

      <div className="px-5 py-6 flex flex-col gap-6">
        {/* Avatar + name */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-4"
        >
          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-accent/10 flex-shrink-0 flex items-center justify-center">
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
            <p className="text-xs text-muted font-medium">Field Installer</p>
          </div>
        </motion.div>

        {/* Contact */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="bg-white rounded-2xl border border-border p-4 flex flex-col gap-3"
        >
          <div className="flex items-center gap-3 text-sm text-zinc-700">
            <Envelope size={16} className="text-accent" />
            {installer.email}
          </div>
          <div className="flex items-center gap-3 text-sm text-zinc-700">
            <Phone size={16} className="text-accent" />
            {installer.phone}
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-2 gap-3"
        >
          <MetricTile value={active} label="Active Units" />
          <MetricTile value={completed} label="Completed" />
        </motion.div>

        {/* Sign out */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="pt-4"
        >
          <Link href="/login">
            <Button variant="ghost" fullWidth>
              <SignOut size={16} />
              Sign Out
            </Button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
