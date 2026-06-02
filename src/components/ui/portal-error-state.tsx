"use client";

import { useEffect } from "react";
import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";

/**
 * Shared fallback rendered by each portal's error.tsx boundary. Keeps the six
 * segment boundaries to a thin wrapper so the message + retry behaviour stays
 * consistent. `reset()` re-renders the segment, retrying the failed render/data.
 */
export function PortalErrorState({
  error,
  reset,
  message = "We couldn't load this screen. This is usually temporary — try again.",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  message?: string;
}) {
  useEffect(() => {
    console.error("Portal error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
        <WarningCircle size={32} className="text-red-600" weight="bold" />
      </div>
      <h1 className="text-xl font-bold text-zinc-800">Something went wrong</h1>
      <p className="max-w-xs text-sm text-zinc-500">{message}</p>
      <button
        onClick={reset}
        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-accent-hover active:scale-[0.97]"
      >
        <ArrowClockwise size={16} weight="bold" />
        Try again
      </button>
    </div>
  );
}
