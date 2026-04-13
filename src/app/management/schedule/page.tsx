import { loadManufacturingRoleSchedule } from "@/lib/manufacturing-scheduler";
import { ScheduleScreen } from "./schedule-screen";

export default async function SchedulePage() {
  const [cutterSchedule, assemblerSchedule, qcSchedule] = await Promise.all([
    loadManufacturingRoleSchedule("cutter"),
    loadManufacturingRoleSchedule("assembler"),
    loadManufacturingRoleSchedule("qc"),
  ]);

  return (
    <ScheduleScreen
      cutterSchedule={cutterSchedule}
      assemblerSchedule={assemblerSchedule}
      qcSchedule={qcSchedule}
    />
  );
}
