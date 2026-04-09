"use client";

import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Images, X } from "@phosphor-icons/react";

interface PhotoSourcePickerProps {
  open: boolean;
  multiple?: boolean;
  onClose: () => void;
  onChange: (files: FileList | null) => void;
}

export function PhotoSourcePicker({
  open,
  multiple = false,
  onClose,
  onChange,
}: PhotoSourcePickerProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.files);
    e.target.value = "";
    onClose();
  };

  return (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={multiple}
        className="sr-only"
        onChange={handleChange}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="sr-only"
        onChange={handleChange}
      />

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-[60] bg-zinc-950/45"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-x-4 bottom-8 z-[61] overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm font-semibold text-foreground hover:bg-surface active:bg-surface border-b border-border"
              >
                <Camera size={20} className="text-accent" />
                Take Photo
              </button>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm font-semibold text-foreground hover:bg-surface active:bg-surface"
              >
                <Images size={20} className="text-accent" />
                Choose from Library
              </button>
              <div className="border-t border-border">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex w-full items-center justify-center gap-2 px-5 py-4 text-sm font-semibold text-zinc-500 hover:bg-surface active:bg-surface"
                >
                  <X size={16} />
                  Cancel
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
