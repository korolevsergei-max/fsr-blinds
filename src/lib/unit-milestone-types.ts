export type UnitMilestoneCoverage = {
  totalWindows: number;
  measuredCount: number;
  bracketedCount: number;
  installedCount: number;
  allMeasured: boolean;
  allBracketed: boolean;
  allInstalled: boolean;
  /** ISO timestamp of when the last required window was measured (or null). */
  measuredCompletedAt: string | null;
  /** ISO timestamp of when the last qualifying bracketed photo was uploaded (or null). */
  bracketedCompletedAt: string | null;
  /** ISO timestamp of when the last qualifying installed photo was uploaded (or null). */
  installedCompletedAt: string | null;
};

export const EMPTY_MILESTONES: UnitMilestoneCoverage = {
  totalWindows: 0,
  measuredCount: 0,
  bracketedCount: 0,
  installedCount: 0,
  allMeasured: false,
  allBracketed: false,
  allInstalled: false,
  measuredCompletedAt: null,
  bracketedCompletedAt: null,
  installedCompletedAt: null,
};
