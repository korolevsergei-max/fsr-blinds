"use client";

import { Camera } from "@phosphor-icons/react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function UploadsPage() {
  return (
    <div className="flex flex-col">
      <PageHeader title="Uploads" subtitle="Your photos and documents" />
      <EmptyState
        icon={Camera}
        title="No uploads yet"
        description="Photos captured during measurements and installations will appear here."
      />
    </div>
  );
}
