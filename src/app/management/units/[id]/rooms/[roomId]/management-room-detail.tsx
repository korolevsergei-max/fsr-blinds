"use client";

import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Ruler,
  Camera,
  Warning,
  CheckCircle,
} from "@phosphor-icons/react";
import { getWindowsByRoom } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export function ManagementRoomDetail({ data }: { data: AppDataset }) {
  const { id, roomId } = useParams<{ id: string; roomId: string }>();
  const unit = data.units.find((u) => u.id === id);
  const room = data.rooms.find((r) => r.id === roomId);
  const windowsList = room ? getWindowsByRoom(data, room.id) : [];

  if (!unit || !room) {
    return <div className="p-6 text-center text-muted">Room not found</div>;
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title={room.name}
        subtitle={`${unit.unitNumber} • ${unit.buildingName}`}
        backHref={`/management/units/${unit.id}`}
      />

      <div className="flex-1 px-4 py-5">
        {windowsList.length === 0 ? (
          <EmptyState
            icon={Ruler}
            title="No windows recorded"
            description="The installer has not added any windows to this room yet."
          />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider">
              {windowsList.length} window{windowsList.length !== 1 ? "s" : ""}
            </p>

            {windowsList.map((win, i) => (
              <motion.div
                key={win.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: i * 0.05,
                  duration: 0.3,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <div className="surface-card p-4">
                  {win.photoUrl && (
                    <div className="mb-3 rounded-[var(--radius-md)] overflow-hidden border border-border bg-surface aspect-[2/1]">
                      <img
                        src={win.photoUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex items-start justify-between mb-2.5">
                    <div>
                      <p className="text-[14px] font-semibold text-foreground tracking-tight">
                        {win.label}
                      </p>
                      <span
                        className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          win.blindType === "blackout"
                            ? "bg-zinc-900 text-white"
                            : "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {win.blindType}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-[12px] text-muted">
                    <span className="flex items-center gap-1.5">
                      <Ruler size={14} />
                      {win.measured ? (
                        <span className="font-mono font-semibold text-foreground">
                          {win.width}&quot; × {win.height}&quot;
                          {win.depth ? ` ×  ${win.depth}&quot;` : ""}
                        </span>
                      ) : (
                        <span className="text-tertiary">Not measured</span>
                      )}
                    </span>
                    <span className="flex items-center gap-1">
                      <Camera size={14} />
                      {win.photoUrl ? (
                        <CheckCircle
                          size={14}
                          weight="fill"
                          className="text-accent"
                        />
                      ) : (
                        <span className="text-tertiary">No photo</span>
                      )}
                    </span>
                  </div>

                  {win.notes && (
                    <p className="mt-2 text-[12px] text-secondary leading-relaxed border-t border-border-subtle pt-2 italic">
                      {win.notes}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
