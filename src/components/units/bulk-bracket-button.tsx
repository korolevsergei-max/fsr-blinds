"use client";

import { useState, useTransition } from "react";
import { Wrench } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { bulkMarkUnitWindowsBracketed } from "@/app/actions/fsr-data";
import { reconcileUnitDerivedState } from "@/lib/unit-status-helpers";
import { useDatasetActionsMaybe } from "@/lib/dataset-context";
import type { UnitMilestoneCoverage } from "@/lib/unit-milestones";

type RoomSummary = {
  id: string;
  name: string;
  windowCount: number;
};

export function BulkBracketButton({
  unitId,
  rooms,
  windowIds,
  milestones,
}: {
  unitId: string;
  rooms: RoomSummary[];
  windowIds: string[];
  milestones: UnitMilestoneCoverage;
}) {
  const datasetActions = useDatasetActionsMaybe();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const allBracketed = milestones.allBracketed;
  const canBracket = milestones.totalWindows > 0 && !allBracketed;

  const totalWindows = rooms.reduce((s, r) => s + r.windowCount, 0);

  const handleConfirm = () => {
    setError("");
    startTransition(async () => {
      const result = await bulkMarkUnitWindowsBracketed(unitId);
      if (!result.ok) {
        setError(result.error ?? "Failed to mark windows as bracketed.");
        return;
      }
      setConfirmOpen(false);
      const windowIdSet = new Set(windowIds);
      datasetActions?.patchData((prev) => {
        const updated = {
          ...prev,
          windows: prev.windows.map((w) =>
            windowIdSet.has(w.id) ? { ...w, bracketed: true } : w
          ),
        };
        return reconcileUnitDerivedState(updated, unitId, { unitStatus: result.unitStatus });
      });
    });
  };

  return (
    <>
      <Button
        fullWidth
        size="lg"
        disabled={!canBracket || pending}
        onClick={() => setConfirmOpen(true)}
        variant="primary"
      >
        <Wrench size={20} weight={allBracketed ? "regular" : "bold"} />
        {allBracketed ? "All windows bracketed" : "Mark all windows as bracketed"}
      </Button>

      {confirmOpen && (
        <>
          <div
            className="fixed inset-0 z-[55] bg-zinc-950/45"
            onClick={() => !pending && setConfirmOpen(false)}
          />
          <div className="fixed inset-x-4 top-1/2 z-[60] -translate-y-1/2 rounded-3xl border border-border bg-white shadow-2xl max-w-lg mx-auto p-6 flex flex-col gap-4">
            <div>
              <p className="text-base font-bold text-foreground">
                Mark all windows as bracketed?
              </p>
              <p className="mt-1.5 text-sm text-zinc-500 leading-relaxed">
                This will mark all{" "}
                <span className="font-semibold text-foreground">
                  {totalWindows} {totalWindows === 1 ? "window" : "windows"}
                </span>{" "}
                as bracketed across:
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {rooms.map((room) => (
                  <li key={room.id} className="text-sm text-zinc-600 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block flex-shrink-0" />
                    {room.name}{" "}
                    <span className="text-zinc-400">
                      ({room.windowCount} {room.windowCount === 1 ? "window" : "windows"})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {error && (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                fullWidth
                size="lg"
                disabled={pending}
                onClick={handleConfirm}
              >
                <Wrench size={20} weight="bold" />
                {pending ? "Saving…" : "Yes, mark all as bracketed"}
              </Button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmOpen(false)}
                className="w-full rounded-2xl border border-border py-3 text-sm font-semibold text-zinc-500 hover:text-foreground transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
