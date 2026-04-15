export type UnitMilestoneCoverage = {
  totalWindows: number;
  measuredCount: number;
  bracketedCount: number;
  manufacturedCount: number;
  installedCount: number;
  allMeasured: boolean;
  allBracketed: boolean;
  allManufactured: boolean;
  allInstalled: boolean;
  /** True when a fully installed legacy unit is treated as manufactured-complete without QC rows. */
  manufacturedByLegacyInstalledFallback: boolean;
  /** Window IDs that have been individually QC-approved (status = "qc_approved"). */
  manufacturedWindowIds: string[];
  /** ISO timestamp of when the last required window was measured (or null). */
  measuredCompletedAt: string | null;
  /** ISO timestamp of when the last qualifying bracketed photo was uploaded (or null). */
  bracketedCompletedAt: string | null;
  /** ISO timestamp of when the last required window was QC-approved (or null). */
  manufacturedCompletedAt: string | null;
  /** ISO timestamp of when the last qualifying installed photo was uploaded (or null). */
  installedCompletedAt: string | null;
};

export function deriveManufacturingMilestoneState({
  totalWindows,
  qcApprovedCount,
  installedCount,
  qcCompletedAt,
  installedCompletedAt,
}: {
  totalWindows: number;
  qcApprovedCount: number;
  installedCount: number;
  qcCompletedAt: string | null;
  installedCompletedAt: string | null;
}) {
  const manufacturedByLegacyInstalledFallback =
    totalWindows > 0 &&
    installedCount >= totalWindows &&
    qcApprovedCount < totalWindows;
  const manufacturedCount = manufacturedByLegacyInstalledFallback
    ? totalWindows
    : qcApprovedCount;
  const allManufactured = totalWindows > 0 && manufacturedCount >= totalWindows;
  const manufacturedCompletedAt = allManufactured
    ? qcCompletedAt ??
      (manufacturedByLegacyInstalledFallback ? installedCompletedAt : null)
    : null;

  return {
    manufacturedCount,
    allManufactured,
    manufacturedCompletedAt,
    manufacturedByLegacyInstalledFallback,
  };
}

export const EMPTY_MILESTONES: UnitMilestoneCoverage = {
  totalWindows: 0,
  measuredCount: 0,
  bracketedCount: 0,
  manufacturedCount: 0,
  installedCount: 0,
  allMeasured: false,
  allBracketed: false,
  allManufactured: false,
  allInstalled: false,
  manufacturedByLegacyInstalledFallback: false,
  manufacturedWindowIds: [],
  measuredCompletedAt: null,
  bracketedCompletedAt: null,
  manufacturedCompletedAt: null,
  installedCompletedAt: null,
};
