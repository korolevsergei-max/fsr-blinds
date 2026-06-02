import type { UnitStageMediaItem } from "@/lib/server-data";

export type WindowStageKey = "pre" | "bracketed" | "installed";

export type GalleryItem = {
  key: string;
  stage: WindowStageKey;
  stageLabel: string;
  url: string;
  title: string;
  createdAt: string | null;
  uploadedByName: string | null;
  uploadedByRole: string | null;
};

export const STAGE_META: Record<
  WindowStageKey,
  { itemStage: UnitStageMediaItem["stage"]; label: string }
> = {
  pre: { itemStage: "scheduled_bracketing", label: "Pre-bracketed" },
  bracketed: { itemStage: "bracketed_measured", label: "Bracketed" },
  installed: { itemStage: "installed_pending_approval", label: "Installed" },
};
