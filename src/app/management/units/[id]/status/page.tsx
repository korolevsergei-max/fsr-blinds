"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAppDataset } from "@/lib/dataset-context";
import { fetchUnitMediaAndMilestones } from "@/app/actions/dataset-queries";
import { EMPTY_MILESTONES, type UnitMilestoneCoverage } from "@/lib/unit-milestone-types";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { UnitStatusEditor } from "@/components/units/unit-status-editor";

export default function ManagementStatusPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useAppDataset();
  const [mediaItems, setMediaItems] = useState<UnitStageMediaItem[]>([]);
  const [milestones, setMilestones] = useState<UnitMilestoneCoverage>(EMPTY_MILESTONES);

  useEffect(() => {
    fetchUnitMediaAndMilestones(id).then(({ mediaItems, milestones }) => {
      setMediaItems(mediaItems);
      setMilestones(milestones);
    });
  }, [id]);

  return (
    <UnitStatusEditor
      data={data}
      mediaItems={mediaItems}
      milestones={milestones}
      unitsBasePath="/management/units"
    />
  );
}
