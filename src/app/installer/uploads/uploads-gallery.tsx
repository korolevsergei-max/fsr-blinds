"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import {
  Buildings,
  Camera,
  Image as ImageIcon,
  Ruler,
  Wrench,
} from "@phosphor-icons/react";
import type { InstallerMediaItem } from "@/lib/server-data";
import { UNIT_PHOTO_STAGES, UNIT_PHOTO_STAGE_LABELS } from "@/lib/types";

const STAGE_META = {
  scheduled_bracketing: {
    label: UNIT_PHOTO_STAGE_LABELS.scheduled_bracketing,
    Icon: Camera,
    color: "text-sky-700",
    bg: "bg-sky-50",
  },
  bracketed_measured: {
    label: UNIT_PHOTO_STAGE_LABELS.bracketed_measured,
    Icon: Ruler,
    color: "text-accent",
    bg: "bg-accent/8",
  },
  installed_pending_approval: {
    label: UNIT_PHOTO_STAGE_LABELS.installed_pending_approval,
    Icon: Wrench,
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
} as const;

export function UploadsGallery({ items }: { items: InstallerMediaItem[] }) {
  // Group: buildingId → unitId → stage
  const buildingMap = new Map<
    string,
    {
      buildingId: string;
      buildingName: string;
      units: Map<
        string,
        {
          unitId: string;
          unitNumber: string;
          stages: Map<(typeof UNIT_PHOTO_STAGES)[number], InstallerMediaItem[]>;
        }
      >;
    }
  >();

  for (const item of items) {
    if (!buildingMap.has(item.buildingId)) {
      buildingMap.set(item.buildingId, {
        buildingId: item.buildingId,
        buildingName: item.buildingName,
        units: new Map(),
      });
    }
    const building = buildingMap.get(item.buildingId)!;

    if (!building.units.has(item.unitId)) {
      building.units.set(item.unitId, {
        unitId: item.unitId,
        unitNumber: item.unitNumber,
        stages: new Map(),
      });
    }
    const unit = building.units.get(item.unitId)!;

    const stage = item.stage;
    if (!unit.stages.has(stage)) {
      unit.stages.set(stage, []);
    }
    unit.stages.get(stage)!.push(item);
  }

  const buildings = Array.from(buildingMap.values());

  return (
    <div className="px-5 py-4 flex flex-col gap-6 pb-24">
      {buildings.map((building, bi) => (
        <motion.div
          key={building.buildingId}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: bi * 0.06, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Building header */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-accent/8 flex items-center justify-center flex-shrink-0">
              <Buildings size={15} className="text-accent" />
            </div>
            <p className="text-sm font-bold text-foreground tracking-tight">
              {building.buildingName}
            </p>
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider ml-auto">
              {Array.from(building.units.values()).reduce(
                (s, u) =>
                  s + Array.from(u.stages.values()).reduce((ps, stageItems) => ps + stageItems.length, 0),
                0
              )}{" "}
              photo{Array.from(building.units.values()).reduce((s, u) => s + Array.from(u.stages.values()).reduce((ps, stageItems) => ps + stageItems.length, 0), 0) !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Units */}
          <div className="flex flex-col gap-4">
            {Array.from(building.units.values()).map((unit) => (
              <div key={unit.unitId} className="bg-white rounded-2xl border border-border overflow-hidden">
                {/* Unit label */}
                <div className="px-4 py-2.5 bg-surface border-b border-border">
                  <p className="text-xs font-bold text-accent uppercase tracking-wider font-mono">
                    {unit.unitNumber}
                  </p>
                </div>

                {/* Stage sections */}
                {UNIT_PHOTO_STAGES.map((stage) => {
                  const photos = unit.stages.get(stage);
                  if (!photos || photos.length === 0) return null;
                  const { label, Icon, color, bg } = STAGE_META[stage];

                  return (
                    <div key={stage}>
                      <div className={`flex items-center gap-2 px-4 py-2 border-b border-border ${bg}`}>
                        <Icon size={13} className={color} />
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>
                          {label}
                        </p>
                        <span className="text-[10px] text-muted font-semibold ml-auto">
                          {photos.length} photo{photos.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 p-3">
                        {photos.map((item) => (
                          <a
                            key={item.id}
                            href={item.publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex flex-col rounded-xl border border-border overflow-hidden hover:border-zinc-300 transition-colors active:scale-[0.99]"
                          >
                            <div className="aspect-[4/3] bg-surface relative overflow-hidden">
                              <Image
                                src={item.publicUrl}
                                alt=""
                                fill
                                unoptimized
                                sizes="(min-width: 640px) 33vw, 50vw"
                                className="object-cover"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                            </div>
                            <div className="px-2.5 py-2">
                              <p className="text-[11px] font-bold text-foreground truncate">
                                {item.label || "Photo"}
                              </p>
                              <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                                {new Date(item.createdAt).toLocaleString("en-CA", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export function UploadsEmpty() {
  return (
    <div className="px-5 py-8 flex flex-col items-center text-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-accent/8 flex items-center justify-center text-accent">
        <ImageIcon size={28} />
      </div>
      <p className="text-sm text-muted max-w-xs leading-relaxed">
        Add windows with photos on a unit to see them listed here. Images are
        stored in your Supabase project.
      </p>
    </div>
  );
}
