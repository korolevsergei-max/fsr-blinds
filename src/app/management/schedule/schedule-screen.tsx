"use client";

import { useState } from "react";
import { CalendarBlank, Factory } from "@phosphor-icons/react";
import { useAppDataset } from "@/lib/dataset-context";
import type { ManufacturingRoleSchedule } from "@/lib/manufacturing-scheduler";
import { OwnerSchedule } from "./owner-schedule";
import { ManufacturingSchedulePanel } from "./manufacturing-schedule-panel";

export function ScheduleScreen({
  cutterSchedule,
  assemblerSchedule,
}: {
  cutterSchedule: ManufacturingRoleSchedule;
  assemblerSchedule: ManufacturingRoleSchedule;
}) {
  const { data } = useAppDataset();
  const [tab, setTab] = useState<"installer" | "manufacturing">("installer");

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-4 pb-2">
        <div className="flex gap-2">
          <button
            onClick={() => setTab("installer")}
            className={[
              "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
              tab === "installer"
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-secondary hover:bg-surface",
            ].join(" ")}
          >
            <CalendarBlank size={16} weight={tab === "installer" ? "fill" : "regular"} />
            Installer Schedule
          </button>
          <button
            onClick={() => setTab("manufacturing")}
            className={[
              "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
              tab === "manufacturing"
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-secondary hover:bg-surface",
            ].join(" ")}
          >
            <Factory size={16} weight={tab === "manufacturing" ? "fill" : "regular"} />
            Manufacturing Schedule
          </button>
        </div>
      </div>

      {tab === "installer" ? (
        <OwnerSchedule data={data} />
      ) : (
        <ManufacturingSchedulePanel
          cutterSchedule={cutterSchedule}
          assemblerSchedule={assemblerSchedule}
        />
      )}
    </div>
  );
}
