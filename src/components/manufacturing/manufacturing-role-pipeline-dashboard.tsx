"use client";

import { useMemo, useState } from "react";
import {
  CalendarBlank,
  CheckCircle,
  FunnelSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import type { ManufacturingRoleSchedule } from "@/lib/manufacturing-scheduler";
import {
  buildManufacturingDashboardState,
  type ManufacturingDashboardCategory,
  type ManufacturingDashboardUnitCard,
} from "@/lib/schedule-view-model";
import { formatStoredDateLongEnglish } from "@/lib/created-date";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import {
  SCHEDULE_INSTALL_DATE_FILTER_LABELS,
  type ScheduleInstallDateFilter,
} from "@/lib/schedule-ui";

type ManufacturingRole = "cutter" | "assembler" | "qc";

const CATEGORY_ORDER: ManufacturingDashboardCategory[] = ["returned", "behind", "at_risk", "today"];

const CATEGORY_COPY: Record<
  ManufacturingDashboardCategory,
  {
    label: string;
    description: string;
    cardClass: string;
    iconClass: string;
    sectionClass: string;
    badgeClass: string;
    activeStyle: {
      backgroundColor: string;
      borderColor: string;
      color: string;
    };
  }
> = {
  today: {
    label: "Today",
    description: "Scheduled into the current workday.",
    cardClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
    iconClass: "text-emerald-600",
    sectionClass: "border-emerald-200 bg-emerald-50/50",
    badgeClass: "bg-emerald-100 text-emerald-800",
    activeStyle: {
      backgroundColor: "#047857",
      borderColor: "#065f46",
      color: "#ffffff",
    },
  },
  returned: {
    label: "Returned",
    description: "Sent back to this role and needs rework.",
    cardClass: "border-red-200 bg-red-50 text-red-800",
    iconClass: "text-red-600",
    sectionClass: "border-red-200 bg-red-50/60",
    badgeClass: "bg-red-100 text-red-800",
    activeStyle: {
      backgroundColor: "#b91c1c",
      borderColor: "#991b1b",
      color: "#ffffff",
    },
  },
  at_risk: {
    label: "At Risk",
    description: "Install is in 1-3 days and this role is still open.",
    cardClass: "border-amber-200 bg-amber-50 text-amber-800",
    iconClass: "text-amber-600",
    sectionClass: "border-amber-200 bg-amber-50/60",
    badgeClass: "bg-amber-100 text-amber-800",
    activeStyle: {
      backgroundColor: "#b45309",
      borderColor: "#92400e",
      color: "#ffffff",
    },
  },
  behind: {
    label: "Behind",
    description: "Install is today or overdue and this role is still open.",
    cardClass: "border-rose-200 bg-rose-50 text-rose-800",
    iconClass: "text-rose-600",
    sectionClass: "border-rose-200 bg-rose-50/60",
    badgeClass: "bg-rose-100 text-rose-800",
    activeStyle: {
      backgroundColor: "#be123c",
      borderColor: "#9f1239",
      color: "#ffffff",
    },
  },
};

function DashboardUnitCard({
  unit,
  role,
  category,
  unitHrefBase,
}: {
  unit: ManufacturingDashboardUnitCard;
  role: ManufacturingRole;
  category: ManufacturingDashboardCategory;
  unitHrefBase: string;
}) {
  const router = useRouter();
  const returnedCount = unit.blindTypeGroups.flatMap((group) => group.windows).filter(
    (window) => window.issueStatus === "open" && window.escalation?.targetRole === role
  ).length;
  const categoryCopy = CATEGORY_COPY[category];
  const borderClass = returnedCount > 0 ? "border-red-200 shadow-[0_1px_3px_rgba(185,28,28,0.08)]" : "border-border";

  return (
    <button
      onClick={() => router.push(`${unitHrefBase}/${unit.unitId}`)}
      className={`w-full text-left overflow-hidden rounded-[var(--radius-lg)] border bg-card px-4 py-4 transition-colors hover:bg-surface/50 ${borderClass}`}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-semibold tracking-tight text-foreground">
              Unit {unit.unitNumber}
            </p>
            {returnedCount > 0 && (
              <span className="rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-red-700">
                {returnedCount} returned
              </span>
            )}
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${categoryCopy.badgeClass}`}>
              {categoryCopy.label}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-secondary">
            {unit.buildingName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium text-tertiary sm:justify-end">
          <span>{unit.scheduledCount} blinds</span>
          {unit.installationDate && (
            <span>
              Install {formatStoredDateLongEnglish(unit.installationDate) ?? unit.installationDate}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function PipelineCard({
  category,
  count,
  active,
  onClick,
}: {
  category: ManufacturingDashboardCategory;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const copy = CATEGORY_COPY[category];
  const Icon =
    category === "today"
      ? CheckCircle
      : category === "returned"
        ? WarningCircle
        : category === "at_risk"
          ? CalendarBlank
          : WarningCircle;

  return (
    <button
      type="button"
      onClick={onClick}
      style={active ? copy.activeStyle : undefined}
      className={[
        "rounded-[22px] border px-3.5 py-3 text-left transition-all",
        active ? "" : copy.cardClass,
        active
          ? "ring-2 ring-offset-2 ring-offset-card ring-current shadow-[0_14px_30px_rgba(15,23,42,0.16)]"
          : "opacity-80 hover:-translate-y-[1px] hover:opacity-100",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-[10px] font-medium uppercase tracking-[0.08em] ${active ? "text-white" : ""}`}>
            {copy.label}
          </p>
          <p className={`mt-2 font-mono text-[1.5rem] font-bold leading-none tracking-[-0.04em] ${active ? "text-white" : ""}`}>
            {count}
          </p>
        </div>
        <Icon size={18} weight="fill" className={active ? "text-white" : copy.iconClass} />
      </div>
      <p className={`mt-3 text-[11px] leading-5 ${active ? "text-white" : "opacity-80"}`}>{copy.description}</p>
    </button>
  );
}

export function ManufacturingRolePipelineDashboard({
  role,
  schedule,
  unitHrefBase,
}: {
  role: ManufacturingRole;
  schedule: ManufacturingRoleSchedule;
  unitHrefBase: string;
}) {
  const [activeCategory, setActiveCategory] = useState<ManufacturingDashboardCategory | null>(null);
  const [buildingFilter, setBuildingFilter] = useState<string[]>([]);
  const [installDateFilter, setInstallDateFilter] = useState<ScheduleInstallDateFilter>("all");

  const allItems = schedule.allItems;
  const buildingOptions = [
    { value: "all", label: "All buildings" },
    ...[
      ...new Map(
        allItems.map((item) => [item.buildingId, { value: item.buildingId, label: item.buildingName }])
      ).values(),
    ],
  ];

  const installDateOptions = Object.entries(SCHEDULE_INSTALL_DATE_FILTER_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const activeFilterCount = [
    buildingFilter.length > 0,
    installDateFilter !== "all",
  ].filter(Boolean).length;

  const dashboardState = useMemo(
    () =>
      buildManufacturingDashboardState({
        schedule,
        role,
        today: new Date(),
        clientFilter: [],
        buildingFilter,
        installDateFilter,
      }),
    [buildingFilter, installDateFilter, role, schedule]
  );

  const visibleSections = activeCategory
    ? dashboardState.sections.filter((section) => section.category === activeCategory)
    : dashboardState.sections.filter((section) => section.count > 0);

  const hasAnyItems = dashboardState.sections.some((section) => section.count > 0);

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
        <div className="flex items-center gap-1.5 flex-shrink-0 text-zinc-400">
          <FunnelSimple size={14} />
          {activeFilterCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </div>
        <FilterDropdown
          multiple
          label="Building"
          values={buildingFilter}
          options={buildingOptions}
          onChange={setBuildingFilter}
        />
        <FilterDropdown
          label="Installation Date"
          value={installDateFilter}
          options={installDateOptions}
          onChange={(value) => setInstallDateFilter(value as ScheduleInstallDateFilter)}
        />
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setBuildingFilter([]);
              setInstallDateFilter("all");
            }}
            className="flex h-8 flex-shrink-0 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-500"
          >
            <X size={11} weight="bold" />
            Clear filters
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {CATEGORY_ORDER.map((category) => (
          <PipelineCard
            key={category}
            category={category}
            count={dashboardState.counts[category]}
            active={activeCategory === category}
            onClick={() => setActiveCategory((current) => (current === category ? null : category))}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-foreground">
            {activeCategory ? `${CATEGORY_COPY[activeCategory].label} pipeline` : "Pipeline overview"}
          </p>
          <p className="mt-1 text-[12px] text-tertiary">
            {activeCategory
              ? `${dashboardState.counts[activeCategory]} blind${dashboardState.counts[activeCategory] === 1 ? "" : "s"} in this lane.`
              : "Returned work is shown first, followed by behind, at-risk, and today."}
          </p>
        </div>
        {activeCategory && (
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-[12px] font-semibold text-secondary transition-colors hover:bg-surface hover:text-foreground"
          >
            <X size={13} weight="bold" />
            Clear lane
          </button>
        )}
      </div>

      {!hasAnyItems ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface/70 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-foreground">No manufacturing pipeline items</p>
          <p className="mt-1 text-[12px] text-tertiary">
            Nothing currently matches this dashboard scope.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleSections.map((section) => (
            <section key={section.category} className="space-y-3">
              <div className={`rounded-[var(--radius-lg)] border px-4 py-3 ${CATEGORY_COPY[section.category].sectionClass}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">
                      {section.label}
                    </p>
                    <p className="mt-1 text-[12px] opacity-80">
                      {CATEGORY_COPY[section.category].description}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${CATEGORY_COPY[section.category].badgeClass}`}>
                    {section.count} blinds
                  </span>
                </div>
              </div>

              {section.units.length === 0 ? (
                <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface/70 px-4 py-4 text-sm text-tertiary">
                  Nothing in this lane.
                </div>
              ) : (
                <div className="space-y-3">
                  {section.units.map((unit) => (
                    <DashboardUnitCard
                      key={`${section.category}-${unit.unitId}`}
                      unit={unit}
                      role={role}
                      category={section.category}
                      unitHrefBase={unitHrefBase}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
