"use client";

import { useEffect, useRef } from "react";
import {
  enqueueUpload,
  registerUploadAction,
} from "@/lib/upload-queue";

/**
 * Hook to register a server action for queued uploads and provide an enqueue function.
 * Usage:
 *   const enqueue = useQueuedUpload("uploadWindowInstalledPhoto", uploadWindowInstalledPhoto);
 *   // In submit handler:
 *   await enqueue(formData);
 */
export function useQueuedUpload(
  actionName: string,
  action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>
) {
  const registered = useRef(false);

  useEffect(() => {
    if (!registered.current) {
      registerUploadAction(actionName, action);
      registered.current = true;
    }
  }, [actionName, action]);

  return async (fd: FormData): Promise<{ ok: true }> => {
    // Register on first call too in case effect hasn't fired
    registerUploadAction(actionName, action);
    await enqueueUpload(actionName, fd);
    return { ok: true };
  };
}
