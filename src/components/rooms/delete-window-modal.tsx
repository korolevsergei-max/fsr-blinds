"use client";

import { AnimatePresence, motion } from "framer-motion";
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
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-zinc-950/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-4 bottom-1/3 z-50 overflow-hidden rounded-2xl border border-border bg-white shadow-2xl sm:inset-x-auto sm:mx-auto sm:w-full sm:max-w-sm"
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
