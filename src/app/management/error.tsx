"use client";

import { PortalErrorState } from "@/components/ui/portal-error-state";

export default function ManagementError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PortalErrorState error={error} reset={reset} />;
}
