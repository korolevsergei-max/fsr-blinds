import { Factory } from "@phosphor-icons/react/dist/ssr";

/**
 * Shown at the top of a factory portal's unit-detail screen when the unit is
 * built by a subcontractor.
 *
 * The queues and process tables already exclude these units, so reaching this
 * screen means a bookmark, a printed label, or a stale tab. The mark buttons are
 * hidden alongside this notice: `wps_guard_manufacturing_ownership` would reject
 * the write regardless, but a cutter should learn the unit isn't theirs from the
 * screen rather than from a failed click after the blind is already cut.
 */
export function SubcontractedNotice({ partnerName }: { partnerName: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
        <Factory size={17} className="text-amber-600" />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-amber-900">
          Manufactured by {partnerName}
        </p>
        <p className="text-[12px] text-amber-800 leading-snug mt-0.5">
          This unit is built by a subcontractor, so there is nothing to record here.
          It does not appear in your queue.
        </p>
      </div>
    </div>
  );
}
