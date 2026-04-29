export type WindowStageState = {
  measured: boolean;
  bracketed: boolean;
  productionStatus: "pending" | "cut" | "assembled" | "qc_approved";
  installed: boolean;
  hasOpenPostInstallIssue: boolean;
};

export function deriveWindowStages(w: WindowStageState) {
  return {
    measurement: w.measured,
    bracketing: w.bracketed,
    cutting: w.productionStatus === "cut" || w.productionStatus === "assembled" || w.productionStatus === "qc_approved",
    assembling: w.productionStatus === "assembled" || w.productionStatus === "qc_approved",
    qc: w.productionStatus === "qc_approved",
    installation: w.installed,
    post_install_issue: w.hasOpenPostInstallIssue,
  };
}
