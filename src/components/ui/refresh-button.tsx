"use client";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      aria-label="Refresh"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <ArrowsClockwise size={14} weight="bold" className={pending ? "animate-spin" : ""} />
    </Button>
  );
}
