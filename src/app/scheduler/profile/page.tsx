"use client";

import { useDatasetSlices, useDatasetSelector } from "@/lib/dataset-context";
import { SchedulerProfile } from "./scheduler-profile";

export default function SchedulerProfilePage() {
  const data = useDatasetSlices(["installers", "schedule", "units"]);
  const userName = useDatasetSelector((value) => value.user.displayName);
  const userEmail = useDatasetSelector((value) => value.user.email);
  const schedulerId = useDatasetSelector((value) => value.linkedEntityId);

  return (
    <SchedulerProfile
      data={data}
      userName={userName}
      userEmail={userEmail}
      schedulerId={schedulerId}
    />
  );
}
