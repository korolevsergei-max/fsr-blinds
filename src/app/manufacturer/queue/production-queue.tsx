"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, WarningCircle, Hourglass, Clock, CalendarBlank } from "@phosphor-icons/react";
import type { ManufacturerUnit } from "@/lib/manufacturer-data";

function daysUntilInstall(installationDate: string | null): number | null {
  if (!installationDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const install = new Date(installationDate);
  install.setHours(0, 0, 0, 0);
  return Math.floor((install.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencyBucket(
  installationDate: string | null
): "overdue" | "due_soon" | "upcoming" | "no_date" {
  const days = daysUntilInstall(installationDate);
  if (days === null) return "no_date";
  if (days < 0) return "overdue";
  if (days <= 3) return "due_soon";
  return "upcoming";
}

function UrgencyBadge({ installationDate }: { installationDate: string | null }) {
  const days = daysUntilInstall(installationDate);
  if (days === null)
    return <span className="text-xs text-tertiary">No install date</span>;
  if (days < 0)
    return (
      <span className="text-xs font-semibold text-red-600 flex items-center gap-1">
        <WarningCircle size={13} weight="fill" />
        {Math.abs(days)}d overdue
      </span>
    );
  if (days === 0)
    return (
      <span className="text-xs font-semibold text-orange-600 flex items-center gap-1">
        <Hourglass size={13} weight="fill" />
        Today
      </span>
    );
  if (days <= 3)
    return (
      <span className="text-xs font-semibold text-yellow-600 flex items-center gap-1">
        <Hourglass size={13} weight="fill" />
        {days}d left
      </span>
    );
  return (
    <span className="text-xs text-tertiary flex items-center gap-1">
      <CalendarBlank size={13} />
      {days}d away
    </span>
  );
}

function UnitRow({ unit }: { unit: ManufacturerUnit }) {
  const router = useRouter();
  const bucket = urgencyBucket(unit.installationDate);

  const borderColor =
    bucket === "overdue"
      ? "border-red-200"
      : bucket === "due_soon"
      ? "border-yellow-200"
      : "border-border";

  return (
    <button
      onClick={() => router.push(`/manufacturer/units/${unit.id}`)}
      className={`w-full text-left rounded-xl border ${borderColor} bg-card px-4 py-3.5 space-y-1.5 active:opacity-70 transition-opacity hover:bg-muted/30`}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm text-primary">
          Unit {unit.unitNumber}
        </span>
        <UrgencyBadge installationDate={unit.installationDate} />
      </div>
      <p className="text-xs text-secondary">
        {unit.buildingName} · {unit.clientName}
      </p>
      <div className="flex items-center justify-between pt-0.5">
        <span className="text-xs text-tertiary">
          {unit.windowCount} window{unit.windowCount !== 1 ? "s" : ""}
        </span>
        {unit.installationDate && (
          <span className="text-xs text-tertiary">
            Install: {unit.installationDate}
          </span>
        )}
      </div>
    </button>
  );
}

function Section({
  title,
  icon,
  units,
}: {
  title: string;
  icon: React.ReactNode;
  units: ManufacturerUnit[];
}) {
  if (units.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        {icon}
        <span className="text-xs font-semibold text-secondary uppercase tracking-wider">
          {title}
        </span>
        <span className="ml-auto text-xs text-tertiary">{units.length}</span>
      </div>
      {units.map((u) => (
        <UnitRow key={u.id} unit={u} />
      ))}
    </div>
  );
}

export function ProductionQueue({ units }: { units: ManufacturerUnit[] }) {
  const router = useRouter();

  const overdue = units.filter((u) => urgencyBucket(u.installationDate) === "overdue");
  const dueSoon = units.filter((u) => urgencyBucket(u.installationDate) === "due_soon");
  const upcoming = units.filter((u) => urgencyBucket(u.installationDate) === "upcoming");
  const noDate = units.filter((u) => urgencyBucket(u.installationDate) === "no_date");

  return (
    <div className="px-4 pt-4 pb-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-tertiary"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-primary">Production Queue</h1>
          <p className="text-xs text-tertiary">
            {units.length} unit{units.length !== 1 ? "s" : ""} to build
          </p>
        </div>
      </div>

      {units.length === 0 ? (
        <div className="rounded-xl border border-border bg-white px-4 py-10 text-center">
          <p className="text-sm font-medium text-primary">Queue is empty</p>
          <p className="text-xs text-tertiary mt-1">
            Units will appear here once all windows are measured by the installer.
          </p>
        </div>
      ) : (
        <>
          <Section
            title="Overdue"
            icon={<WarningCircle size={14} weight="fill" className="text-red-500" />}
            units={overdue}
          />
          <Section
            title="Due Within 3 Days"
            icon={<Hourglass size={14} weight="fill" className="text-yellow-500" />}
            units={dueSoon}
          />
          <Section
            title="Upcoming"
            icon={<Clock size={14} weight="fill" className="text-tertiary" />}
            units={upcoming}
          />
          <Section
            title="No Install Date"
            icon={<CalendarBlank size={14} className="text-tertiary" />}
            units={noDate}
          />
        </>
      )}
    </div>
  );
}
