"use client";

import { useParams } from "next/navigation";
import { useUnitMilestones } from "@/lib/use-unit-supplemental";
import { StatusUpdate } from "./status-update";

export default function InstallerStatusPage() {
  const { id } = useParams<{ id: string }>();
  const milestones = useUnitMilestones(id);
  return <StatusUpdate milestones={milestones} />;
}
