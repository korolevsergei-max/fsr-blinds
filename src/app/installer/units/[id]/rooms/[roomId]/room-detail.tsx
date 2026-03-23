"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Plus,
  Ruler,
  Camera,
  Warning,
  CheckCircle,
  ArrowRight,
} from "@phosphor-icons/react";
import { units, rooms, getWindowsByRoom } from "@/lib/mock-data";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { RiskDot } from "@/components/ui/risk-badge";
import { EmptyState } from "@/components/ui/empty-state";

export function RoomDetail() {
  const { id, roomId } = useParams<{ id: string; roomId: string }>();
  const unit = units.find((u) => u.id === id);
  const room = rooms.find((r) => r.id === roomId);
  const windowsList = room ? getWindowsByRoom(room.id) : [];

  if (!unit || !room) {
    return <div className="p-6 text-center text-muted">Room not found</div>;
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title={room.name}
        subtitle={`${unit.unitNumber} \u2022 ${unit.buildingName}`}
        backHref={`/installer/units/${unit.id}`}
      />

      <div className="flex-1 px-4 py-5">
        {windowsList.length === 0 ? (
          <EmptyState
            icon={Ruler}
            title="No windows yet"
            description="Add windows in this room to start recording measurements and photos."
            action={
              <Link href={`/installer/units/${id}/rooms/${roomId}/windows/new`}>
                <Button>
                  <Plus size={16} weight="bold" />
                  Add First Window
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted font-medium">
                {windowsList.length} window{windowsList.length !== 1 ? "s" : ""}
              </p>
              <Link href={`/installer/units/${id}/rooms/${roomId}/windows/new`}>
                <button className="flex items-center gap-1 text-xs font-medium text-accent hover:underline active:scale-[0.96]">
                  <Plus size={14} weight="bold" />
                  Add Window
                </button>
              </Link>
            </div>

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
                <Link
                  href={`/installer/units/${id}/rooms/${roomId}/windows/new?edit=${win.id}`}
                >
                  <div className="bg-white rounded-2xl border border-border p-4 hover:border-zinc-300 transition-all active:scale-[0.99]">
                    <div className="flex items-start justify-between mb-2.5">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900 tracking-tight">
                          {win.label}
                        </p>
                        <span
                          className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${
                            win.blindType === "blackout"
                              ? "bg-zinc-900 text-white"
                              : "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {win.blindType}
                        </span>
                      </div>
                      <RiskDot flag={win.riskFlag} />
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <Ruler size={14} />
                        {win.measured ? (
                          <span className="font-mono text-zinc-700">
                            {win.width}&quot; x {win.height}&quot;
                          </span>
                        ) : (
                          "Not measured"
                        )}
                      </span>
                      <span className="flex items-center gap-1">
                        <Camera size={14} />
                        {win.photoUrl ? (
                          <CheckCircle
                            size={14}
                            weight="fill"
                            className="text-emerald-500"
                          />
                        ) : (
                          "Required"
                        )}
                      </span>
                      {win.riskFlag !== "green" && (
                        <span className="flex items-center gap-1">
                          <Warning size={14} className="text-amber-500" />
                          Flagged
                        </span>
                      )}
                    </div>

                    {win.notes && (
                      <p className="mt-2 text-xs text-zinc-500 line-clamp-1 italic">
                        {win.notes}
                      </p>
                    )}
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky footer */}
      {windowsList.length > 0 && (
        <div className="sticky bottom-20 px-4 pb-4 pt-3 bg-gradient-to-t from-background via-background to-transparent">
          <Link href={`/installer/units/${id}`}>
            <Button variant="secondary" fullWidth size="lg">
              Done with Room
              <ArrowRight size={16} weight="bold" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
