"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useAppDataset } from "@/lib/dataset-context";
import { fetchUnitSupplementalData } from "@/app/actions/dataset-queries";
import { WindowForm } from "@/components/windows/window-form";
import type { UnitActivityLog } from "@/lib/types";

export default function InstallerNewWindowPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const formKey = searchParams.get("t") ?? "default";
  const { data } = useAppDataset();
  const [activityLog, setActivityLog] = useState<UnitActivityLog[]>([]);

  useEffect(() => {
    fetchUnitSupplementalData(id).then((s) => setActivityLog(s.activityLog));
  }, [id]);

  return (
    <Suspense fallback={<div className="p-6 text-center text-muted text-sm">Loading form…</div>}>
      <WindowForm key={formKey} data={data} activityLog={activityLog} />
    </Suspense>
  );
}
