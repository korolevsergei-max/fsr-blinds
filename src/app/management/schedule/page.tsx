import { loadPersistedRoleSchedule } from "@/lib/manufacturing-scheduler";
import { ScheduleScreen } from "./schedule-screen";

export default function SchedulePage() {
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
    loadPersistedRoleSchedule("cutter", { includeArchived: true }),
    loadPersistedRoleSchedule("assembler", { includeArchived: true }),
    loadPersistedRoleSchedule("qc", { includeArchived: true }),
  ]).then(([cutter, assembler, qc]) => ({ cutter, assembler, qc }));

  return <ScheduleScreen manufacturingSchedulesPromise={manufacturingSchedulesPromise} />;
}
