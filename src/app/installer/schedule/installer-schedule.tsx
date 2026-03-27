"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  CaretLeft,
  CaretRight,
  Wrench,
  Hammer,
} from "@phosphor-icons/react";
import { getScheduleByInstaller } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import { PageHeader } from "@/components/ui/page-header";

function getWeekDays(baseDate: Date): Date[] {
  const monday = new Date(baseDate);
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function formatDateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function InstallerSchedule({
  data,
  installerId = "inst-1",
}: {
  data: AppDataset;
  installerId?: string;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const today = new Date();
  const baseDate = new Date(today);
  baseDate.setDate(today.getDate() + weekOffset * 7);

  const weekDays = getWeekDays(baseDate);
  const entries = getScheduleByInstaller(data, installerId);

  const entriesByDate = new Map<string, typeof entries>();
  entries.forEach((e) => {
    const list = entriesByDate.get(e.date) || [];
    list.push(e);
    entriesByDate.set(e.date, list);
  });

  const weekLabel = `${weekDays[0].toLocaleDateString("en-CA", { month: "short", day: "numeric" })} \u2013 ${weekDays[6].toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`;

  return (
    <div className="flex flex-col">
      <PageHeader title="Schedule" subtitle="Your assigned work this week" />

      <div className="px-4 py-4">
        {/* Week navigation */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-border hover:bg-zinc-50 transition-colors active:scale-[0.96]"
          >
            <CaretLeft size={16} weight="bold" />
          </button>
          <span className="text-sm font-semibold text-zinc-900 tracking-tight">
            {weekLabel}
          </span>
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-border hover:bg-zinc-50 transition-colors active:scale-[0.96]"
          >
            <CaretRight size={16} weight="bold" />
          </button>
        </div>

        {/* Day columns */}
        <div className="flex flex-col gap-1">
          {weekDays.map((day, dayIdx) => {
            const key = formatDateKey(day);
            const isToday = key === today.toISOString().split("T")[0];
            const dayEntries = entriesByDate.get(key) || [];

            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: dayIdx * 0.04,
                  duration: 0.3,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <div
                  className={`flex items-start gap-3 py-3 ${
                    dayIdx < 6 ? "border-b border-border" : ""
                  }`}
                >
                  {/* Day label */}
                  <div
                    className={`w-12 flex-shrink-0 flex flex-col items-center pt-0.5 ${
                      isToday ? "text-accent" : "text-muted"
                    }`}
                  >
                    <span className="text-[10px] font-medium uppercase tracking-wider">
                      {dayLabels[dayIdx]}
                    </span>
                    <span
                      className={`text-lg font-semibold font-mono ${
                        isToday ? "text-accent" : "text-zinc-700"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    {isToday && (
                      <div className="w-1.5 h-1.5 rounded-full bg-accent mt-0.5" />
                    )}
                  </div>

                  {/* Entries */}
                  <div className="flex-1 min-w-0">
                    {dayEntries.length === 0 ? (
                      <div className="py-2">
                        <span className="text-xs text-zinc-300">No tasks</span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {dayEntries.map((entry) => (
                          <Link
                            key={entry.id}
                            href={`/installer/units/${entry.unitId}`}
                          >
                            <div className="bg-white rounded-xl border border-border px-3.5 py-3 hover:border-zinc-300 transition-all active:scale-[0.99]">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  {entry.taskType === "bracketing" ? (
                                    <Wrench
                                      size={14}
                                      className="text-sky-500"
                                    />
                                  ) : (
                                    <Hammer
                                      size={14}
                                      className="text-emerald-500"
                                    />
                                  )}
                                  <span
                                    className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                      entry.taskType === "bracketing"
                                        ? "bg-sky-50 text-sky-600"
                                        : "bg-emerald-50 text-emerald-600"
                                    }`}
                                  >
                                    {entry.taskType}
                                  </span>
                                </div>
                              </div>
                              <p className="text-sm font-medium text-zinc-900 tracking-tight">
                                {entry.unitNumber}
                              </p>
                              <p className="text-xs text-muted truncate">
                                {entry.buildingName}
                              </p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
