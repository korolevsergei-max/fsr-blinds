"use client";

/**
 * Pre-registers all queued upload server actions at module load time.
 * This ensures the action registry is populated even after a page reload,
 * before any form component has mounted. Import this in the root layout.
 */
import { registerUploadAction } from "@/lib/upload-queue";
import {
  uploadWindowPostBracketingPhoto,
  uploadWindowInstalledPhoto,
} from "@/app/actions/fsr-data";

registerUploadAction("uploadWindowPostBracketingPhoto", uploadWindowPostBracketingPhoto);
registerUploadAction("uploadWindowInstalledPhoto", uploadWindowInstalledPhoto);
