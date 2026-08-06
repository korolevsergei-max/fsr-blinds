import { loadSubcontractorWorklist } from "@/lib/subcontractor-data";
import { SubcontractorWorkTable } from "@/components/subcontractor/subcontractor-work-table";

export default async function SubcontractorCompletedPage() {
  const { partner, items } = await loadSubcontractorWorklist();

  // Most recently completed first — the opposite of the production queue, because
  // here they are checking what just went out, not what to start next.
  const completed = items
    .filter((item) => item.productionStatus === "qc_approved")
    .sort((a, b) => (b.qcApprovedAt ?? "").localeCompare(a.qcApprovedAt ?? ""));

  return (
    <SubcontractorWorkTable
      items={completed}
      partnerName={partner?.name ?? "worklist"}
      view="completed"
    />
  );
}
