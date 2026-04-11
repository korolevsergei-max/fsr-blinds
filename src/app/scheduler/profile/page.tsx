"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { SchedulerProfile } from "./scheduler-profile";

export default function SchedulerProfilePage() {
  const { data, user, linkedEntityId } = useAppDataset();

  return (
    <SchedulerProfile
      data={data}
      userName={user.displayName}
      userEmail={user.email}
      schedulerId={linkedEntityId}
    />
  );
}
