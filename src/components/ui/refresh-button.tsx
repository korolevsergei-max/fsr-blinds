"use client";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useDatasetActionsMaybe } from "@/lib/dataset-context";

export function RefreshButton() {
  const router = useRouter();
  const actions = useDatasetActionsMaybe();
  const [pending, setPending] = useState(false);

  const handleRefresh = async () => {
    if (pending) return;
    setPending(true);
    try {
      // The lists render from the in-memory dataset store, which AppDatasetProvider seeds once and
      // then only updates via setData. router.refresh() re-runs server components but never re-seeds
      // that store, so on its own it leaves stale cards. Re-fetch the store's scope first.
      if (actions?.refresh) await actions.refresh();
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="secondary"
      aria-label="Refresh"
      disabled={pending}
      onClick={handleRefresh}
    >
      <ArrowsClockwise size={14} weight="bold" className={pending ? "animate-spin" : ""} />
    </Button>
  );
}
