"use client";

type Tone = "emerald" | "blue" | "amber";

export function ScheduleSummaryCards({
  scheduled,
  completed,
  issues,
}: {
  scheduled: number;
  completed: number;
  issues: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      <SummaryCard label="Scheduled" value={scheduled} tone="blue" />
      <SummaryCard label="Completed" value={completed} tone="emerald" />
      <SummaryCard label="Issues" value={issues} tone="amber" />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: Tone;
}) {
  const classes = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  };

  return (
    <div className={`rounded-[22px] border px-3.5 py-3 ${classes[tone]}`}>
      <p className="text-[10px] font-medium uppercase tracking-[0.08em]">{label}</p>
      <p className="mt-2 font-mono text-[1.5rem] font-bold leading-none tracking-[-0.04em]">
        {value}
      </p>
    </div>
  );
}
