"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CalendarBlank, Envelope, Phone, SignOut } from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { PageHeader } from "@/components/ui/page-header";
import { MetricTile } from "@/components/ui/metric-tile";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/actions/auth-actions";

type SchedulerProfileProps = {
  data: AppDataset;
  schedulerId: string | null;
  userName: string;
  userEmail: string;
};

export function SchedulerProfile({
  data,
  schedulerId,
  userName,
  userEmail,
}: SchedulerProfileProps) {
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();

  const scheduler = useMemo(() => {
    if (!schedulerId) return null;

    return {
      id: schedulerId,
      name: userName,
      email: userEmail,
      phone:
        data.installers.find((installer) => installer.id === `sch-${schedulerId}`)?.phone ??
        "No phone on file",
    };
  }, [data.installers, schedulerId, userEmail, userName]);

  const activeUnits = data.units.filter((unit) => unit.status !== "installed").length;
  const completedUnits = data.units.length - activeUnits;
  const upcomingEvents = data.schedule.filter((entry) => {
    const today = new Date().toISOString().slice(0, 10);
    return entry.date >= today;
  }).length;

  return (
    <div className="flex flex-col">
      <PageHeader title="Profile" backHref="/scheduler" />

      <div className="px-5 py-6 flex flex-col gap-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="surface-card p-5 flex flex-col gap-4"
        >
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-[var(--radius-xl)] bg-accent-light text-accent flex items-center justify-center text-lg font-semibold">
              {userName
                .split(" ")
                .map((part) => part[0] ?? "")
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-foreground tracking-tight">
                {scheduler?.name ?? userName}
              </h2>
              <p className="text-[12px] text-tertiary font-medium">
                Scheduler
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 text-[14px] text-foreground">
              <Envelope size={15} className="text-accent" />
              <span className="truncate">{scheduler?.email ?? userEmail}</span>
            </div>
            <div className="flex items-center gap-3 text-[14px] text-foreground">
              <Phone size={15} className="text-accent" />
              <span>{scheduler?.phone ?? "No phone on file"}</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-3 gap-3"
        >
          <MetricTile value={activeUnits} label="Active Units" />
          <MetricTile value={completedUnits} label="Completed" />
          <MetricTile value={upcomingEvents} label="Upcoming" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="surface-card p-4 flex items-start gap-3"
        >
          <div className="mt-0.5 w-9 h-9 rounded-[var(--radius-md)] bg-accent-light text-accent flex items-center justify-center flex-shrink-0">
            <CalendarBlank size={18} />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-foreground">
              Scheduler access
            </p>
            <p className="text-[12px] text-tertiary mt-1">
              This profile reflects the units and schedule currently assigned to your scheduler scope.
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="pt-2"
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
            {signingOut ? "Signing out..." : "Sign Out"}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
