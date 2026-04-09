"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAppDataset } from "@/lib/dataset-context";
import { fetchUnitMilestones } from "@/app/actions/dataset-queries";
import { EMPTY_MILESTONES, type UnitMilestoneCoverage } from "@/lib/unit-milestone-types";
import { StatusUpdate } from "./status-update";

export default function InstallerStatusPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useAppDataset();
  const [milestones, setMilestones] = useState<UnitMilestoneCoverage>(EMPTY_MILESTONES);

  useEffect(() => {
    fetchUnitMilestones(id).then(setMilestones);
  }, [id]);

  return <StatusUpdate data={data} milestones={milestones} />;
}
