"use client";

import { ClockCounterClockwise } from "@phosphor-icons/react";
import type { UnitActivityLog } from "@/lib/types";

function formatActivityDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildWindowActivityDescription(log: UnitActivityLog): string {
  const details = log.details ?? {};
  if (log.action === "window_created") {
    const w = details.width != null ? details.width : null;
    const h = details.height != null ? details.height : null;
    const d = details.depth != null ? details.depth : null;
    const measurementParts = [
      w != null ? `W: ${w}"` : null,
      h != null ? `H: ${h}"` : null,
      d != null ? `D: ${d}"` : null,
    ].filter(Boolean);
    const measurementStr = measurementParts.length > 0
      ? `Measurements set (${measurementParts.join(", ")}).`
      : "Window created.";
    const photoStr = details.hasPhoto ? " Photo uploaded." : " No photo uploaded.";
    return measurementStr + photoStr;
  }
  if (log.action === "window_updated") {
    return details.replacedPhoto
      ? "Window details updated and photo replaced."
      : "Window details updated.";
  }
  if (log.action === "post_bracketing_photo_added") {
    return "Post-bracketing photo uploaded.";
  }
  if (log.action === "installed_photo_added") {
    return "Installed photo uploaded.";
  }
  if (log.action === "post_install_issue_opened") {
    const note = typeof details.note === "string" && details.note.trim() ? ` ${details.note}` : "";
    return `Post-install issue opened.${note}`;
  }
  if (log.action === "post_install_issue_note_added") {
    const note = typeof details.note === "string" && details.note.trim() ? ` ${details.note}` : "";
    return `Post-install issue note added.${note}`;
  }
  if (log.action === "post_install_issue_resolved") {
    const note = typeof details.note === "string" && details.note.trim() ? ` ${details.note}` : "";
    return `Post-install issue resolved.${note}`;
  }
  return "Window activity recorded.";
}

export function WindowHistoryTimeline({ history }: { history: UnitActivityLog[] }) {
  return (
    <div className="mt-4 rounded-2xl border border-border bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <ClockCounterClockwise size={16} className="text-zinc-500" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
          Window History
        </h3>
      </div>
      {history.length === 0 ? (
        <p className="text-xs text-zinc-500">
          No changes logged yet for this window.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {history.map((log) => (
            <div
              key={log.id}
              className="rounded-xl border border-border bg-surface px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {buildWindowActivityDescription(log)}
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {log.actorName}
                  </p>
                </div>
                <span className="text-[10px] text-zinc-500 whitespace-nowrap">
                  {formatActivityDate(log.createdAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
