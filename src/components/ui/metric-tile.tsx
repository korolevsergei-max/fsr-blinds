"use client";

export function MetricTile({
  value,
  label,
}: {
  value: number | string;
  label: string;
}) {
  return (
    <div className="surface-card p-5 flex flex-col items-center justify-center text-center">
      <p className="text-[1.75rem] font-bold text-accent font-mono tracking-tight leading-none">
        {value}
      </p>
      <p className="text-[11px] font-medium text-tertiary uppercase tracking-[0.06em] mt-2">
        {label}
      </p>
    </div>
  );
}
