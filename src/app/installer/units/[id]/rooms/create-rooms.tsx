"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash, Door } from "@phosphor-icons/react";
import { units, getRoomsByUnit } from "@/lib/mock-data";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

const quickChips = ["Living Room", "Bedroom 1", "Bedroom 2", "Kitchen", "Office", "Bathroom", "Den"];

interface LocalRoom {
  tempId: string;
  name: string;
}

export function CreateRooms() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const unit = units.find((u) => u.id === id);
  const existingRooms = unit ? getRoomsByUnit(unit.id) : [];

  const [newRooms, setNewRooms] = useState<LocalRoom[]>([]);
  const [customName, setCustomName] = useState("");

  const allNames = new Set([
    ...existingRooms.map((r) => r.name),
    ...newRooms.map((r) => r.name),
  ]);

  const addRoom = (name: string) => {
    if (!name.trim() || allNames.has(name.trim())) return;
    setNewRooms((prev) => [
      ...prev,
      { tempId: crypto.randomUUID(), name: name.trim() },
    ]);
    setCustomName("");
  };

  const removeRoom = (tempId: string) => {
    setNewRooms((prev) => prev.filter((r) => r.tempId !== tempId));
  };

  if (!unit) {
    return <div className="p-6 text-center text-muted">Unit not found</div>;
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title="Create Rooms"
        subtitle={`${unit.unitNumber} \u2022 ${unit.buildingName}`}
        backHref={`/installer/units/${unit.id}`}
      />

      <div className="flex-1 px-4 py-5 flex flex-col gap-6">
        {/* Existing rooms */}
        {existingRooms.length > 0 && (
          <div>
            <h2 className="text-xs font-medium text-muted uppercase tracking-widest mb-3">
              Existing Rooms
            </h2>
            <div className="flex flex-col gap-2">
              {existingRooms.map((room) => (
                <div
                  key={room.id}
                  className="flex items-center gap-3 bg-white rounded-xl border border-border px-4 py-3"
                >
                  <Door size={16} className="text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-900">{room.name}</span>
                  <span className="text-xs text-muted ml-auto">
                    {room.windowCount} windows
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick add chips */}
        <div>
          <h2 className="text-xs font-medium text-muted uppercase tracking-widest mb-3">
            Quick Add
          </h2>
          <div className="flex flex-wrap gap-2">
            {quickChips
              .filter((c) => !allNames.has(c))
              .map((chip) => (
                <button
                  key={chip}
                  onClick={() => addRoom(chip)}
                  className="px-3.5 py-2 rounded-xl bg-white border border-border text-sm text-zinc-700 font-medium hover:border-zinc-300 active:scale-[0.96] transition-all"
                >
                  {chip}
                </button>
              ))}
          </div>
        </div>

        {/* Custom name input */}
        <div>
          <h2 className="text-xs font-medium text-muted uppercase tracking-widest mb-3">
            Custom Room Name
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRoom(customName)}
              placeholder="e.g. Sunroom, Closet..."
              className="flex-1 h-11 px-3.5 rounded-xl border border-border bg-white text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
            />
            <Button
              variant="secondary"
              size="md"
              onClick={() => addRoom(customName)}
              disabled={!customName.trim() || allNames.has(customName.trim())}
            >
              <Plus size={18} weight="bold" />
            </Button>
          </div>
        </div>

        {/* New rooms list */}
        {newRooms.length > 0 && (
          <div>
            <h2 className="text-xs font-medium text-muted uppercase tracking-widest mb-3">
              New Rooms ({newRooms.length})
            </h2>
            <div className="flex flex-col gap-2">
              <AnimatePresence mode="popLayout">
                {newRooms.map((room) => (
                  <motion.div
                    key={room.tempId}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="flex items-center justify-between bg-white rounded-xl border border-border px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <Door size={16} className="text-accent" />
                      <span className="text-sm font-medium text-zinc-900">
                        {room.name}
                      </span>
                    </div>
                    <button
                      onClick={() => removeRoom(room.tempId)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors active:scale-[0.96]"
                    >
                      <Trash size={16} />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-20 px-4 pb-4 pt-3 bg-gradient-to-t from-background via-background to-transparent">
        <Button
          fullWidth
          size="lg"
          disabled={newRooms.length === 0 && existingRooms.length === 0}
          onClick={() => router.push(`/installer/units/${unit.id}`)}
        >
          Save Rooms & Continue
        </Button>
      </div>
    </div>
  );
}
