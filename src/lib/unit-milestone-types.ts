export type UnitMilestoneCoverage = {
  totalWindows: number;
  measuredCount: number;
  bracketedCount: number;
  /** Windows whose production_status has reached `cut` (or beyond). */
  cutCount: number;
  /** Windows whose production_status has reached `assembled` (or beyond). */
  assembledCount: number;
  /** Windows individually QC-approved (production_status = "qc_approved"). */
  qcApprovedCount: number;
  manufacturedCount: number;
  installedCount: number;
  /** Windows that currently have an open post-install issue. Stubbed until Phase 6. */
  postInstallIssueOpenCount: number;
  allMeasured: boolean;
  allBracketed: boolean;
  allCut: boolean;
  allAssembled: boolean;
  allQcApproved: boolean;
  allManufactured: boolean;
  allInstalled: boolean;
  hasOpenPostInstallIssue: boolean;
  manufacturedByLegacyInstalledFallback: boolean;
  manufacturedWindowIds: string[];
  measuredCompletedAt: string | null;
  bracketedCompletedAt: string | null;
  cutCompletedAt: string | null;
  assembledCompletedAt: string | null;
  qcApprovedCompletedAt: string | null;
  manufacturedCompletedAt: string | null;
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
  cutCount: 0,
  assembledCount: 0,
  qcApprovedCount: 0,
  manufacturedCount: 0,
  installedCount: 0,
  postInstallIssueOpenCount: 0,
  allMeasured: false,
  allBracketed: false,
  allCut: false,
  allAssembled: false,
  allQcApproved: false,
  allManufactured: false,
  allInstalled: false,
  hasOpenPostInstallIssue: false,
  manufacturedByLegacyInstalledFallback: false,
  manufacturedWindowIds: [],
  measuredCompletedAt: null,
  bracketedCompletedAt: null,
  cutCompletedAt: null,
  assembledCompletedAt: null,
  qcApprovedCompletedAt: null,
  manufacturedCompletedAt: null,
  installedCompletedAt: null,
};
