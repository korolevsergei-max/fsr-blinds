"use client";


import { WarningCircle } from "@phosphor-icons/react";

export function FlagIssueModal({
  issueWindow,
  unit,
  room,
  note,
  error,
  pending,
  onNoteChange,
  onCancel,
  onSubmit,
}: {
  issueWindow: { label: string } | null;
  unit: { unitNumber: string } | null;
  room: { name: string } | null;
  note: string;
  error: string | null;
  pending: boolean;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      {issueWindow && unit && room && (
        <>
          <button
            type="button"
            aria-label="Close post-install issue dialog"
            className="animate-fade-in fixed inset-0 z-40 bg-zinc-950/45"
            onClick={onCancel}
          />
          <div
            className="animate-fade-scale fixed inset-x-4 bottom-1/4 z-50 overflow-hidden rounded-2xl border border-border bg-white shadow-2xl sm:inset-x-auto sm:mx-auto sm:w-full sm:max-w-sm"
          >
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                  <WarningCircle size={22} weight="fill" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">Flag Post-Install Issue</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Window: {issueWindow.label} · {room.name} · Unit {unit.unitNumber}
                  </p>
                </div>
              </div>
            </div>
            <div className="px-5 py-4">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                Note
              </label>
              <textarea
                value={note}
                onChange={(event) => {
                  onNoteChange(event.target.value);
                }}
                required
                rows={4}
                className="w-full resize-none rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              />
              {error && (
                <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {error}
                </p>
              )}
            </div>
            <div className="flex border-t border-border">
              <button
                type="button"
                className="flex-1 py-3.5 text-sm font-semibold text-muted"
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending || !note.trim()}
                className="flex-1 border-l border-border py-3.5 text-sm font-semibold text-red-600 disabled:opacity-50"
                onClick={onSubmit}
              >
                Open issue
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
