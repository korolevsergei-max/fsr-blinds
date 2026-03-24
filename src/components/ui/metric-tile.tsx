"use client";

export function MetricTile({
  value,
  label,
}: {
  value: number | string;
  label: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-border p-5 flex flex-col items-center justify-center text-center">
      <p className="text-2xl font-bold text-accent font-mono tracking-tight leading-none">
        {value}
      </p>
      <p className="text-[10px] font-bold text-muted uppercase tracking-wider mt-1.5">
        {label}
      </p>
    </div>
  );
}
