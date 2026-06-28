"use client";


import { Trash } from "@phosphor-icons/react";

export function DeleteWindowModal({
  open,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      {open && (
        <>
          <div
            className="animate-fade-in fixed inset-0 z-40 bg-zinc-950/45"
            onClick={onCancel}
          />
          <div
            className="animate-fade-scale fixed inset-x-4 bottom-1/3 z-50 overflow-hidden rounded-2xl border border-border bg-white shadow-2xl sm:inset-x-auto sm:mx-auto sm:w-full sm:max-w-sm"
          >
            <div className="p-5">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-500">
                <Trash size={22} />
              </div>
              <p className="text-sm font-bold text-foreground">Delete window?</p>
              <p className="mt-1 text-xs text-muted">
                This will permanently delete the window and all its photos. This cannot be undone.
              </p>
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
                disabled={pending}
                className="flex-1 border-l border-border py-3.5 text-sm font-semibold text-red-600 disabled:opacity-50"
                onClick={onConfirm}
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
