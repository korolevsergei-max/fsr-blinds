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
  const manufacturingSchedulesPromise = Promise.all([
    loadPersistedRoleSchedule("cutter"),
    loadPersistedRoleSchedule("assembler"),
    loadPersistedRoleSchedule("qc"),
  ]).then(([cutter, assembler, qc]) => ({ cutter, assembler, qc }));

  return <ScheduleScreen manufacturingSchedulesPromise={manufacturingSchedulesPromise} />;
}
