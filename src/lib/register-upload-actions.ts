"use client";

/**
 * Pre-registers queued upload handlers at module load time.
 * This ensures the action registry is populated even after a page reload,
 * before any form component has mounted. Import this in the root layout.
 */
import { registerUploadAction } from "@/lib/upload-queue";
import {
  WINDOW_PHOTO_UPLOAD_ACTION,
  runWindowPhotoUpload,
} from "@/lib/window-photo-queue";

registerUploadAction(WINDOW_PHOTO_UPLOAD_ACTION, runWindowPhotoUpload);
