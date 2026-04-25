"use client";

export function MetricTile({
  value,
  label,
  compact = false,
}: {
  value: number | string;
  label: string;
  compact?: boolean;
}) {
  return (
    <div
      className={[
        "surface-card flex flex-col items-center justify-center text-center",
        compact ? "p-3" : "p-5",
      ].join(" ")}
    >
      <p
        className={[
          "font-bold text-accent font-mono tracking-tight leading-none",
          compact ? "text-[1.35rem]" : "text-[1.75rem]",
        ].join(" ")}
      >
        {value}
      </p>
      <p
        className={[
          "text-[11px] font-medium text-tertiary uppercase tracking-[0.06em]",
          compact ? "mt-1" : "mt-2",
        ].join(" ")}
      >
        {label}
      </p>
    </div>
  );
}
