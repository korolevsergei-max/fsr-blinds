"use client";

import { useState, useTransition } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import type { Building, Client } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { setSchedulerBuildingAccess } from "@/app/actions/auth-actions";

export function SchedulerAccessEditor({
  schedulerId,
  clients,
  buildings,
  initialAllowedIds,
}: {
  schedulerId: string;
  clients: Client[];
  buildings: Building[];
  initialAllowedIds: string[];
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialAllowedIds)
  );
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const handleSave = () => {
    setError("");
    startTransition(async () => {
      const result = await setSchedulerBuildingAccess(schedulerId, [...selectedIds]);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  };

  const toggleBuilding = (buildingId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(buildingId)) next.delete(buildingId);
      else next.add(buildingId);
      return next;
    });
    setSaved(false);
  };

  const toggleClient = (clientId: string) => {
    const clientBuildings = buildings.filter((b) => b.clientId === clientId);
    const allSelected = clientBuildings.every((b) => selectedIds.has(b.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        clientBuildings.forEach((b) => next.delete(b.id));
      } else {
        clientBuildings.forEach((b) => next.add(b.id));
      }
      return next;
    });
    setSaved(false);
  };

  const clientsWithBuildings = clients.filter((c) =>
    buildings.some((b) => b.clientId === c.id)
  );

  return (
    <div className="mt-3 pt-3 border-t border-border flex flex-col gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">
        Building Access
      </p>

      {clientsWithBuildings.length === 0 ? (
        <p className="text-[12px] text-tertiary">No clients or buildings configured yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {clientsWithBuildings.map((client) => {
            const clientBuildings = buildings.filter((b) => b.clientId === client.id);
            const allSelected = clientBuildings.every((b) => selectedIds.has(b.id));
            const someSelected = clientBuildings.some((b) => selectedIds.has(b.id));

            return (
              <div key={client.id} className="border border-border rounded-[var(--radius-md)] p-3">
                <button
                  type="button"
                  onClick={() => toggleClient(client.id)}
                  className="flex items-center gap-2 w-full text-left"
                >
                  <span
                    className={[
                      "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                      allSelected
                        ? "bg-accent border-accent"
                        : someSelected
                          ? "bg-accent/25 border-accent/50"
                          : "border-border bg-surface",
                    ].join(" ")}
                  >
                    {(allSelected || someSelected) && (
                      <CheckCircle
                        size={10}
                        className="text-white"
                        weight="fill"
                      />
                    )}
                  </span>
                  <span className="text-[13px] font-semibold text-foreground flex-1">
                    {client.name}
                  </span>
                  <span className="text-[11px] text-tertiary">
                    {clientBuildings.filter((b) => selectedIds.has(b.id)).length}/
                    {clientBuildings.length}
                  </span>
                </button>

                <div className="mt-2 flex flex-col gap-1.5 pl-6">
                  {clientBuildings.map((building) => (
                    <button
                      key={building.id}
                      type="button"
                      onClick={() => toggleBuilding(building.id)}
                      className="flex items-center gap-2 text-left"
                    >
                      <span
                        className={[
                          "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                          selectedIds.has(building.id)
                            ? "bg-accent border-accent"
                            : "border-border bg-surface",
                        ].join(" ")}
                      >
                        {selectedIds.has(building.id) && (
                          <CheckCircle size={10} className="text-white" weight="fill" />
                        )}
                      </span>
                      <span className="text-[12px] text-secondary">{building.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      <div className="flex items-center gap-3">
        <Button size="sm" disabled={pending} onClick={handleSave}>
          {pending ? "Saving…" : saved ? "Saved!" : "Save access"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-[12px] text-success font-medium">
            <CheckCircle size={13} weight="fill" />
            Changes saved
          </span>
        )}
      </div>
    </div>
  );
}
