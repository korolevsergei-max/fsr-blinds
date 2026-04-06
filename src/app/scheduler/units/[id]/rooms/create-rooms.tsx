"use client";

import { useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash, Door, PencilSimple, ArrowRight, Info, Check, X } from "@phosphor-icons/react";
import { createRoomsForUnit, deleteRoom, updateRoomName } from "@/app/actions/fsr-data";
import { getRoomsByUnit } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

const quickChips = ["Living Room", "Bedroom 1", "Bedroom 2", "Kitchen", "Office", "Bathroom", "Den"];

interface LocalRoom {
  tempId: string;
  name: string;
}

export function CreateRooms({ data }: { data: AppDataset }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [newRooms, setNewRooms] = useState<LocalRoom[]>([]);
  const [customName, setCustomName] = useState("");
  const [saveError, setSaveError] = useState("");
  const [editingExistingRoomId, setEditingExistingRoomId] = useState<string | null>(null);
  const [editingNewRoomTempId, setEditingNewRoomTempId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [pending, startTransition] = useTransition();

  const unit = data.units.find((u) => u.id === id);
  const existingRooms = unit ? getRoomsByUnit(data, unit.id) : [];

  if (!unit) {
    return <div className="p-6 text-center text-muted">Unit not found</div>;
  }

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

  const startEditExistingRoom = (roomId: string, name: string) => {
    setEditingNewRoomTempId(null);
    setEditingExistingRoomId(roomId);
    setEditName(name);
    setSaveError("");
  };

  const startEditNewRoom = (tempId: string, name: string) => {
    setEditingExistingRoomId(null);
    setEditingNewRoomTempId(tempId);
    setEditName(name);
    setSaveError("");
  };

  const cancelEdit = () => {
    setEditingExistingRoomId(null);
    setEditingNewRoomTempId(null);
    setEditName("");
  };

  const saveExistingRoomEdit = (roomId: string) => {
    const nextName = editName.trim();
    if (!nextName) {
      setSaveError("Room name is required.");
      return;
    }
    const duplicateExisting = existingRooms.some(
      (r) => r.id !== roomId && r.name.toLowerCase() === nextName.toLowerCase()
    );
    const duplicateNew = newRooms.some((r) => r.name.toLowerCase() === nextName.toLowerCase());
    if (duplicateExisting || duplicateNew) {
      setSaveError("A room with this name already exists.");
      return;
    }

    startTransition(async () => {
      const result = await updateRoomName(roomId, unit.id, nextName);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      cancelEdit();
      router.refresh();
    });
  };

  const saveNewRoomEdit = (tempId: string) => {
    const nextName = editName.trim();
    if (!nextName) {
      setSaveError("Room name is required.");
      return;
    }
    const duplicateExisting = existingRooms.some(
      (r) => r.name.toLowerCase() === nextName.toLowerCase()
    );
    const duplicateNew = newRooms.some(
      (r) => r.tempId !== tempId && r.name.toLowerCase() === nextName.toLowerCase()
    );
    if (duplicateExisting || duplicateNew) {
      setSaveError("A room with this name already exists.");
      return;
    }

    setNewRooms((prev) =>
      prev.map((room) => (room.tempId === tempId ? { ...room, name: nextName } : room))
    );
    cancelEdit();
  };

  const removeExistingRoom = (roomId: string, roomName: string) => {
    const confirmed = window.confirm(
      `Delete "${roomName}"? This can only be done if no windows are saved in that room.`
    );
    if (!confirmed) return;

    setSaveError("");
    startTransition(async () => {
      const result = await deleteRoom(roomId, unit.id);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      if (editingExistingRoomId === roomId) {
        cancelEdit();
      }
      router.refresh();
    });
  };

  if (!unit) {
    return <div className="p-6 text-center text-muted">Unit not found</div>;
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title="Rooms"
        subtitle={`${unit.unitNumber}`}
        backHref={`/scheduler/units/${unit.id}`}
      />

      <div className="px-5 pt-4 pb-2">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          {unit.buildingName}
        </h2>
        <p className="text-xs text-muted mt-0.5">
          {unit.unitNumber} • Create Room Profiles
        </p>
      </div>

      <div className="flex-1 px-5 py-4 flex flex-col gap-6">
        {saveError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            {saveError}
          </p>
        )}

        {/* Room name input + quick add */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <label className="text-[10px] font-bold text-muted uppercase tracking-wider block mb-2">
            Room Name
          </label>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRoom(customName)}
              placeholder="e.g. Master Bedroom"
              className="flex-1 h-12 px-4 rounded-2xl border border-border bg-surface text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
            />
            <Button
              variant="primary"
              size="md"
              onClick={() => addRoom(customName)}
              disabled={!customName.trim() || allNames.has(customName.trim())}
              className="rounded-2xl"
            >
              <Plus size={18} weight="bold" />
            </Button>
          </div>

          <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
            Quick Add
          </p>
          <div className="flex flex-wrap gap-2">
            {quickChips
              .filter((c) => !allNames.has(c))
              .map((chip) => (
                <button
                  key={chip}
                  onClick={() => addRoom(chip)}
                  className="px-3.5 py-2 rounded-full bg-white border border-border text-sm text-zinc-600 font-medium hover:bg-surface hover:border-zinc-300 active:scale-[0.96] transition-all"
                >
                  {chip}
                </button>
              ))}
          </div>
        </div>

        {/* Existing rooms */}
        {existingRooms.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold tracking-tight text-foreground">
                Existing Rooms
              </h3>
              <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                {existingRooms.length} Added
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {existingRooms.map((room) => (
                <div
                  key={room.id}
                  className="flex items-center gap-3 bg-white rounded-2xl border border-border px-4 py-3.5"
                >
                  <div className="w-9 h-9 rounded-xl bg-accent/8 flex items-center justify-center">
                    <Door size={16} className="text-accent" />
                  </div>
                  <div className="flex-1">
                    {editingExistingRoomId === room.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveExistingRoomEdit(room.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        className="h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                      />
                    ) : (
                      <p className="text-sm font-semibold text-foreground">{room.name}</p>
                    )}
                    <p className="text-[11px] text-muted">{room.windowCount} Windows</p>
                  </div>
                  {editingExistingRoomId === room.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => saveExistingRoomEdit(room.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditExistingRoom(room.id, room.name)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors active:scale-[0.96]"
                    >
                      <PencilSimple size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeExistingRoom(room.id, room.name)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors active:scale-[0.96]"
                    title="Delete room"
                  >
                    <Trash size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* New rooms list */}
        {newRooms.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold tracking-tight text-foreground">
                Unit Rooms
              </h3>
              <span className="text-[10px] font-bold text-accent uppercase tracking-wider">
                {newRooms.length} Added
              </span>
            </div>
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
                    className="flex items-center gap-3 bg-white rounded-2xl border border-border px-4 py-3.5"
                  >
                    <div className="w-9 h-9 rounded-xl bg-accent/8 flex items-center justify-center">
                      <Door size={16} className="text-accent" />
                    </div>
                    <div className="flex-1">
                      {editingNewRoomTempId === room.tempId ? (
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveNewRoomEdit(room.tempId);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          className="h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                        />
                      ) : (
                        <span className="text-sm font-semibold text-foreground">
                          {room.name}
                        </span>
                      )}
                    </div>
                    {editingNewRoomTempId === room.tempId ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => saveNewRoomEdit(room.tempId)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditNewRoom(room.tempId, room.name)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors active:scale-[0.96]"
                      >
                        <PencilSimple size={16} />
                      </button>
                    )}
                    <button
                      type="button"
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

        {/* Add another room dashed button */}
        <button
          onClick={() => {
            const nameInput = document.querySelector<HTMLInputElement>('input[placeholder="e.g. Master Bedroom"]');
            nameInput?.focus();
          }}
          className="flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-accent/30 text-accent text-sm font-semibold hover:bg-accent/3 active:scale-[0.99] transition-all"
        >
          <Plus size={16} weight="bold" />
          Add Another Room
        </button>

        {/* Info callout */}
        <div className="bg-accent/5 rounded-2xl border border-accent/15 p-4 flex gap-3">
          <Info size={20} weight="fill" className="text-accent flex-shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-600 leading-relaxed">
            Defining rooms accurately allows for automated hardware specification across the unit inventory.
          </p>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-20 px-5 pb-4 pt-3 bg-gradient-to-t from-white via-white to-transparent">
        <Button
          fullWidth
          size="lg"
          disabled={
            (newRooms.length === 0 && existingRooms.length === 0) || pending
          }
          onClick={() => {
            setSaveError("");
            startTransition(async () => {
              if (newRooms.length > 0) {
                const result = await createRoomsForUnit(
                  unit.id,
                  newRooms.map((r) => r.name)
                );
                if (!result.ok) {
                  setSaveError(result.error);
                  return;
                }
              }
              router.push(`/scheduler/units/${unit.id}`);
              router.refresh();
            });
          }}
        >
          {pending ? "Saving…" : "Save Rooms & Continue"}
          <ArrowRight size={16} weight="bold" />
        </Button>
      </div>
    </div>
  );
}
