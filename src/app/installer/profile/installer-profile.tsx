"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Envelope,
  Phone,
  SignOut,
  Buildings,
  CalendarBlank,
} from "@phosphor-icons/react";
import { installers, getUnitsByInstaller } from "@/lib/mock-data";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

export function InstallerProfile() {
  const installer = installers[0];
  const myUnits = getUnitsByInstaller(installer.id);
  const active = myUnits.filter((u) => u.status !== "client_approved").length;
  const completed = myUnits.filter((u) => u.status === "client_approved").length;

  return (
    <div className="flex flex-col">
      <PageHeader title="Profile" />

      <div className="px-4 py-6 flex flex-col gap-6">
        {/* Avatar + name */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-4"
        >
          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-zinc-200 flex-shrink-0">
            <img
              src={installer.avatarUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 tracking-tight">
              {installer.name}
            </h2>
            <p className="text-xs text-muted">Field Installer</p>
          </div>
        </motion.div>

        {/* Contact */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-3"
        >
          <div className="flex items-center gap-3 text-sm text-zinc-700">
            <Envelope size={16} className="text-zinc-400" />
            {installer.email}
          </div>
          <div className="flex items-center gap-3 text-sm text-zinc-700">
            <Phone size={16} className="text-zinc-400" />
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
          <div className="bg-white rounded-2xl border border-border p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center">
              <Buildings size={18} className="text-zinc-500" />
            </div>
            <div>
              <p className="text-lg font-semibold text-zinc-900 font-mono">{active}</p>
              <p className="text-xs text-muted">Active Units</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-border p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center">
              <CalendarBlank size={18} className="text-zinc-500" />
            </div>
            <div>
              <p className="text-lg font-semibold text-zinc-900 font-mono">{completed}</p>
              <p className="text-xs text-muted">Completed</p>
            </div>
          </div>
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
