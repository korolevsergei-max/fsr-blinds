"use client";

import { RISK_LABELS, type RiskFlag } from "@/lib/types";

type WindowRiskNotesFieldsProps = {
  riskFlag: RiskFlag;
  notes: string;
  notesError?: string;
  onRiskFlagChange: (flag: RiskFlag) => void;
  onNotesChange: (notes: string) => void;
};

export function WindowRiskNotesFields({
  riskFlag,
  notes,
  notesError,
  onRiskFlagChange,
  onNotesChange,
}: WindowRiskNotesFieldsProps) {
  return (
    <>
      <div className="mb-5 flex flex-col gap-2">
        <label className="text-xs font-bold text-zinc-600 uppercase tracking-[0.1em]">
          Risk Flag
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(["green", "yellow", "red"] as RiskFlag[]).map((flag) => (
            <button
              key={flag}
              type="button"
              onClick={() => onRiskFlagChange(flag)}
              className={`min-h-11 rounded-2xl border px-2 py-2 text-[13px] font-semibold tracking-tight transition-all active:scale-[0.97] ${
                riskFlag === flag
                  ? flag === "green"
                    ? "border-teal-700 bg-teal-600 text-white"
                    : flag === "yellow"
                      ? "border-amber-700 bg-amber-500 text-white"
                      : "border-red-700 bg-red-600 text-white"
                  : "border-border bg-white text-zinc-600 hover:bg-surface"
              }`}
            >
              {flag === "green" && "Green"}
              {flag === "yellow" && "Yellow"}
              {flag === "red" && "Red"}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500">
          {riskFlag === "green" && "No issues."}
          {riskFlag === "yellow" &&
            `${RISK_LABELS.yellow}: can bracket/install with concern or additional work.`}
          {riskFlag === "red" &&
            `${RISK_LABELS.red}: cannot proceed without escalation.`}
        </p>
      </div>

      {riskFlag !== "green" && (
        <>
          <label className="mb-2 block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
            Notes <span className="text-red-500">*</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Any special conditions, frame damage, clearance issues..."
            rows={2}
            className={`w-full resize-none rounded-2xl border px-4 py-3 text-sm text-foreground bg-white placeholder:text-zinc-400 transition-all focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent ${
              notesError ? "border-red-300 bg-red-50" : "border-border"
            }`}
          />
          {notesError && <p className="mt-2 text-xs text-red-500">{notesError}</p>}
        </>
      )}
    </>
  );
}
