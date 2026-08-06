import { loadSubcontractorWorklist } from "@/lib/subcontractor-data";
import { SubcontractorWorkTable } from "@/components/subcontractor/subcontractor-work-table";

export default async function SubcontractorProductionPage() {
  const { partner, items } = await loadSubcontractorWorklist();

  // Everything not yet marked complete. The list arrives oldest-first from the
  // loader; this filter preserves that order.
  const production = items.filter((item) => item.productionStatus !== "qc_approved");

  return (
    <SubcontractorWorkTable
      items={production}
      partnerName={partner?.name ?? "worklist"}
      view="production"
    />
  );
}
