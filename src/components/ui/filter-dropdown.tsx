"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CaretDown } from "@phosphor-icons/react";

type FilterDropdownProps = {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
};

export function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const active = value !== options[0]?.value;
  const displayLabel = options.find((option) => option.value === value)?.label ?? label;

  function handleToggle() {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen((current) => !current);
  }

  useEffect(() => {
    if (!open) return;

    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);

    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className={[
          "flex h-8 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-all",
          active
            ? "border-accent bg-accent text-white"
            : "border-border bg-card text-secondary hover:border-zinc-300",
        ].join(" ")}
      >
        {active ? displayLabel : label}
        <CaretDown
          size={11}
          weight="bold"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <div key="dropdown-container">
            <div
              key="dropdown-backdrop"
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              key="dropdown-menu"
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              style={{ top: position.top, left: position.left }}
              className="fixed z-50 min-w-[168px] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card py-1 shadow-[var(--shadow-md)]"
            >
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={[
                    "w-full px-3.5 py-2.5 text-left text-xs font-medium transition-colors",
                    option.value === value
                      ? "bg-emerald-50 text-accent"
                      : "text-zinc-700 hover:bg-zinc-50",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              ))}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
