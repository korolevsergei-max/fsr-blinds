import { loadManufacturingRoleSchedule } from "@/lib/manufacturing-scheduler";
import { ScheduleScreen } from "./schedule-screen";

export default async function SchedulePage() {
  const [cutterSchedule, assemblerSchedule] = await Promise.all([
    loadManufacturingRoleSchedule("cutter"),
    loadManufacturingRoleSchedule("assembler"),
  ]);

  return (
    <ScheduleScreen
      cutterSchedule={cutterSchedule}
      assemblerSchedule={assemblerSchedule}
    />
  );
}
