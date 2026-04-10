"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CaretDown, Check } from "@phosphor-icons/react";

type Option = { value: string; label: string };

type SingleProps = {
  label: string;
  options: Option[];
  multiple?: false;
  value: string;
  onChange: (value: string) => void;
};

type MultiProps = {
  label: string;
  options: Option[];
  multiple: true;
  values: string[];
  onChange: (values: string[]) => void;
};

type FilterDropdownProps = SingleProps | MultiProps;

export function FilterDropdown(props: FilterDropdownProps) {
  const { label, options } = props;
  const isMulti = props.multiple === true;

  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  // ─── Derived display state ────────────────────────────────────────────────
  let active = false;
  let displayLabel = label;

  if (isMulti) {
    const p = props as MultiProps;
    active = p.values.length > 0;
    if (p.values.length === 1) {
      displayLabel = options.find((o) => o.value === p.values[0])?.label ?? label;
    } else if (p.values.length > 1) {
      displayLabel = `${label} (${p.values.length})`;
    }
  } else {
    const p = props as SingleProps;
    active = p.value !== options[0]?.value;
    displayLabel = options.find((o) => o.value === p.value)?.label ?? label;
  }

  // ─── Position calculation ─────────────────────────────────────────────────
  function handleToggle() {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const pad = 12;
      if (rect.left > vw / 2) {
        setPosition({ top: rect.bottom + 6, right: Math.max(pad, vw - rect.right) });
      } else {
        setPosition({ top: rect.bottom + 6, left: Math.max(pad, rect.left) });
      }
    }
    setOpen((v) => !v);
  }

  // Scroll listener removed as it causes immediate close on subtle layout shifts
  // or user scrolling inside the dropdown. The backdrop handles outside clicks.
  // ─── Item interaction ─────────────────────────────────────────────────────
  function handleSingle(value: string) {
    (props as SingleProps).onChange(value);
    setOpen(false);
  }

  function handleMulti(value: string) {
    const p = props as MultiProps;
    // "all" option = clear everything
    if (value === "all" || value === options[0]?.value) {
      p.onChange([]);
      setOpen(false);
      return;
    }
    const current = p.values;
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    p.onChange(next);
    // keep open so user can select multiple
  }

  // ─── Render ───────────────────────────────────────────────────────────────
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
        {open && typeof document !== "undefined" && createPortal(
          <div key="dd-wrap" className="relative z-[9999]">
            <div
              key="dd-backdrop"
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              key="dd-menu"
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              style={{ top: position.top, left: position.left, right: position.right }}
              className="fixed z-50 min-w-[180px] max-h-72 overflow-y-auto overflow-x-hidden rounded-[var(--radius-lg)] border border-border bg-card py-1 shadow-[var(--shadow-md)]"
            >
              {options.map((option) => {
                const isFirst = option.value === options[0]?.value;

                if (isMulti) {
                  const p = props as MultiProps;
                  // "All X" row — active when nothing selected
                  if (isFirst) {
                    const allActive = p.values.length === 0;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleMulti(option.value)}
                        className={[
                          "w-full flex items-center justify-between px-3.5 py-2.5 text-left text-xs font-medium transition-colors",
                          allActive
                            ? "bg-emerald-50 text-accent"
                            : "text-zinc-500 hover:bg-zinc-50",
                        ].join(" ")}
                      >
                        <span>{option.label}</span>
                        {allActive && <Check size={13} weight="bold" className="text-accent flex-shrink-0" />}
                      </button>
                    );
                  }
                  // Normal multi-select row
                  const checked = p.values.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleMulti(option.value)}
                      className={[
                        "w-full flex items-center justify-between px-3.5 py-2.5 text-left text-xs font-medium transition-colors",
                        checked
                          ? "bg-emerald-50 text-accent"
                          : "text-zinc-700 hover:bg-zinc-50",
                      ].join(" ")}
                    >
                      <span>{option.label}</span>
                      {checked && <Check size={13} weight="bold" className="text-accent flex-shrink-0" />}
                    </button>
                  );
                }

                // Single-select (original behavior)
                const p = props as SingleProps;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSingle(option.value)}
                    className={[
                      "w-full px-3.5 py-2.5 text-left text-xs font-medium transition-colors",
                      option.value === p.value
                        ? "bg-emerald-50 text-accent"
                        : "text-zinc-700 hover:bg-zinc-50",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                );
              })}
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>
    </>
  );
}
