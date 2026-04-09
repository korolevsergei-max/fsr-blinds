"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { WifiSlash, CloudArrowUp, ArrowClockwise, Check } from "@phosphor-icons/react";
import { subscribeToQueue, retryFailed, clearFailed, type QueuedUpload } from "@/lib/upload-queue";
import "@/lib/register-upload-actions";

function useOnlineStatus() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true
  );
}

function useUploadQueue() {
  const [items, setItems] = useState<QueuedUpload[]>([]);
  useEffect(() => subscribeToQueue(setItems), []);
  return items;
}

export function ConnectionStatus() {
  const online = useOnlineStatus();
  const queue = useUploadQueue();
  const [dismissed, setDismissed] = useState(false);

  const uploading = queue.filter((i) => i.status === "uploading").length;
  const queued = queue.filter((i) => i.status === "queued").length;
  const failed = queue.filter((i) => i.status === "failed").length;
  const pending = uploading + queued;

  // Reset dismissed when status changes
  useEffect(() => {
    if (dismissed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(false);
    }
  }, [online, pending, failed, dismissed]);

  if (dismissed) return null;

  // Nothing to show
  if (online && pending === 0 && failed === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none flex justify-center">
      <div className="mx-auto max-w-lg w-full pointer-events-auto">
        {!online && (
          <div className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2.5 text-sm font-medium shadow-lg">
            <WifiSlash size={18} weight="bold" />
            <span className="flex-1">You&apos;re offline — changes will sync when reconnected</span>
          </div>
        )}

        {pending > 0 && (
          <div className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 text-sm font-medium shadow-lg">
            <CloudArrowUp size={18} weight="bold" className="animate-pulse" />
            <span className="flex-1">
              {(() => {
                const activeItems = queue.filter((i) => i.status === "uploading" || i.status === "queued");
                const hasPhotos = activeItems.some((i) => i.fileData !== null);
                if (uploading > 0) {
                  return hasPhotos
                    ? `Uploading photo${pending > 1 ? ` (${pending} queued)` : ""}…`
                    : "Saving…";
                }
                return hasPhotos
                  ? `${pending} photo${pending > 1 ? "s" : ""} waiting to upload`
                  : `${pending} save${pending > 1 ? "s" : ""} pending`;
              })()}
            </span>
          </div>
        )}

        {failed > 0 && pending === 0 && (
          <div className="flex items-center gap-2 bg-red-600 text-white px-4 py-2.5 text-sm font-medium shadow-lg">
            <span className="flex-1">
              {failed} upload{failed > 1 ? "s" : ""} failed
            </span>
            <button
              onClick={() => retryFailed()}
              className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30 transition-colors"
            >
              <ArrowClockwise size={14} weight="bold" />
              Retry
            </button>
            <button
              onClick={() => clearFailed()}
              className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30 transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        {online && pending === 0 && failed === 0 && queue.length === 0 && (
          <div className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 text-sm font-medium shadow-lg animate-fade-out">
            <Check size={18} weight="bold" />
            <span>All uploads complete</span>
          </div>
        )}
      </div>
    </div>
  );
}
