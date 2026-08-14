import { loadPersistedRoleSchedule } from "@/lib/manufacturing-scheduler";
import { loadManufacturingPartners } from "@/lib/server-data/datasets";
import { INTERNAL_PARTNER_ID } from "@/lib/manufacturing-partners";
import { ScheduleScreen } from "./schedule-screen";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const partners = await loadManufacturingPartners();
  const stations = partners.filter((p) => p.isInternal);

  // The owner has no station of their own — loadPersistedRoleSchedule requires
  // one explicitly (see its RoleScheduleOptions comment), and merging two
  // stations' day buckets would report a capacity neither of them has. Pick
  // from the switcher's ?station= param, falling back to the first station
  // rather than the INTERNAL_PARTNER_ID constant, so a renamed or reordered
  // Station A still resolves correctly.
  const requestedStationId = typeof params.station === "string" ? params.station : undefined;
  const stationId =
    stations.find((s) => s.id === requestedStationId)?.id ?? stations[0]?.id ?? INTERNAL_PARTNER_ID;

  // Pure read — the schedule is reflowed by mutations, never by views.
  //
  // Don't await here: kick the three role-schedule reads off as one promise and hand
  // it to the (client) ScheduleScreen unresolved. The page frame and the default
  // "installer" tab (which reads the already-loaded dataset from context) paint
  // immediately; the manufacturing tab unwraps this promise behind its own Suspense
  // boundary, so these reads no longer block first paint on every visit.
  // includeArchived: the management schedule's completed count reads qc_approved
  // items across all-time history (schedule-view-model), so it must include
  // archived (fully-installed) rows once C1's archive move runs.
  const manufacturingSchedulesPromise = Promise.all([
    loadPersistedRoleSchedule("cutter", { includeArchived: true, stationId }),
    loadPersistedRoleSchedule("assembler", { includeArchived: true, stationId }),
    loadPersistedRoleSchedule("qc", { includeArchived: true, stationId }),
  ]).then(([cutter, assembler, qc]) => ({ cutter, assembler, qc }));

  return (
    <ScheduleScreen
      manufacturingSchedulesPromise={manufacturingSchedulesPromise}
      stations={stations}
      activeStationId={stationId}
    />
  );
}
