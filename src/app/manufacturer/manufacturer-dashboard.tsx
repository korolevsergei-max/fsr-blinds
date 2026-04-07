"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { SignOut, WarningCircle, CheckCircle, Hourglass, Queue } from "@phosphor-icons/react";
import { signOut } from "@/app/actions/auth-actions";
import type { ManufacturerDataset } from "@/lib/manufacturer-data";

function urgencyBucket(installationDate: string | null): "overdue" | "due_soon" | "upcoming" | "no_date" {
  if (!installationDate) return "no_date";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const install = new Date(installationDate);
  install.setHours(0, 0, 0, 0);
  const days = Math.floor((install.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return "overdue";
  if (days <= 3) return "due_soon";
  return "upcoming";
}

export function ManufacturerDashboard({
  data,
  userName,
}: {
  data: ManufacturerDataset;
  userName?: string;
}) {
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();
  const { units } = data;

  const overdue = units.filter((u) => urgencyBucket(u.installationDate) === "overdue");
  const dueSoon = units.filter((u) => urgencyBucket(u.installationDate) === "due_soon");
  const upcoming = units.filter((u) => urgencyBucket(u.installationDate) === "upcoming");
  const noDate = units.filter((u) => urgencyBucket(u.installationDate) === "no_date");

  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-tertiary uppercase tracking-widest font-medium mb-1">Manufacturer</p>
          <h1 className="text-xl font-semibold text-primary">
            {userName ? `Hi, ${userName.split(" ")[0]}` : "Production"}
          </h1>
        </div>
        <button
          onClick={() => startSignOut(async () => { await signOut(); })}
          disabled={signingOut}
          className="flex items-center gap-1.5 text-xs text-tertiary hover:text-secondary transition-colors px-2 py-1.5 rounded-md hover:bg-muted"
        >
          <SignOut size={14} />
          Sign out
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Overdue"
          value={overdue.length}
          color="red"
          icon={<WarningCircle size={18} weight="fill" className="text-red-500" />}
        />
        <StatCard
          label="Due in 3 days"
          value={dueSoon.length}
          color="yellow"
          icon={<Hourglass size={18} weight="fill" className="text-yellow-500" />}
        />
        <StatCard
          label="Upcoming"
          value={upcoming.length}
          color="green"
          icon={<CheckCircle size={18} weight="fill" className="text-green-500" />}
        />
      </div>

      {/* Quick access to queue */}
      <button
        onClick={() => router.push("/manufacturer/queue")}
        className="w-full flex items-center justify-between px-4 py-3 bg-accent text-white rounded-xl font-medium text-sm active:opacity-80 transition-opacity"
      >
        <span className="flex items-center gap-2">
          <Queue size={18} />
          Open Production Queue
        </span>
        <span className="text-white/80">{units.length} unit{units.length !== 1 ? "s" : ""}</span>
      </button>

      {/* Overdue alert */}
      {overdue.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
            <WarningCircle size={16} weight="fill" />
            {overdue.length} unit{overdue.length !== 1 ? "s" : ""} past the build deadline
          </p>
          <p className="text-xs text-red-600">
            Installation date is within 3 days. Complete and QC these urgently.
          </p>
          <div className="mt-2 space-y-1">
            {overdue.slice(0, 3).map((u) => (
              <button
                key={u.id}
                onClick={() => router.push(`/manufacturer/units/${u.id}`)}
                className="w-full text-left text-xs text-red-700 font-medium hover:underline"
              >
                Unit {u.unitNumber} — {u.buildingName}
                {u.installationDate && (
                  <span className="font-normal text-red-500 ml-1">
                    (install {u.installationDate})
                  </span>
                )}
              </button>
            ))}
            {overdue.length > 3 && (
              <p className="text-xs text-red-500">+{overdue.length - 3} more</p>
            )}
          </div>
        </div>
      )}

      {/* Due soon */}
      {dueSoon.length > 0 && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-yellow-700 flex items-center gap-1.5">
            <Hourglass size={16} weight="fill" />
            {dueSoon.length} unit{dueSoon.length !== 1 ? "s" : ""} due within 3 days
          </p>
          <div className="mt-2 space-y-1">
            {dueSoon.slice(0, 3).map((u) => (
              <button
                key={u.id}
                onClick={() => router.push(`/manufacturer/units/${u.id}`)}
                className="w-full text-left text-xs text-yellow-700 font-medium hover:underline"
              >
                Unit {u.unitNumber} — {u.buildingName}
                {u.installationDate && (
                  <span className="font-normal text-yellow-600 ml-1">
                    (install {u.installationDate})
                  </span>
                )}
              </button>
            ))}
            {dueSoon.length > 3 && (
              <p className="text-xs text-yellow-600">+{dueSoon.length - 3} more</p>
            )}
          </div>
        </div>
      )}

      {/* No units message */}
      {units.length === 0 && (
        <div className="rounded-xl border border-border bg-white px-4 py-8 text-center">
          <CheckCircle size={32} className="mx-auto mb-2 text-green-500" weight="fill" />
          <p className="text-sm font-medium text-primary">All caught up!</p>
          <p className="text-xs text-tertiary mt-1">No units in the production queue right now.</p>
        </div>
      )}

      {/* Upcoming count */}
      {noDate.length > 0 && (
        <p className="text-xs text-tertiary text-center">
          {noDate.length} unit{noDate.length !== 1 ? "s" : ""} without an installation date assigned
        </p>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: "red" | "yellow" | "green";
  icon: React.ReactNode;
}) {
  const bgColors = { red: "bg-red-50", yellow: "bg-yellow-50", green: "bg-green-50" };
  const borderColors = { red: "border-red-100", yellow: "border-yellow-100", green: "border-green-100" };
  const textColors = { red: "text-red-700", yellow: "text-yellow-700", green: "text-green-700" };

  return (
    <div className={`rounded-xl border ${borderColors[color]} ${bgColors[color]} px-3 py-3 flex flex-col gap-1`}>
      {icon}
      <span className={`text-2xl font-bold ${textColors[color]}`}>{value}</span>
      <span className="text-[10px] text-tertiary leading-tight">{label}</span>
    </div>
  );
}
