import { after } from "next/server";
import { revalidatePath } from "next/cache";
import {
  loadPersistedRoleSchedule,
  reflowManufacturingSchedules,
} from "@/lib/manufacturing-scheduler";
import { ScheduleScreen } from "./schedule-screen";

export default async function SchedulePage() {
  const [cutterSchedule, assemblerSchedule, qcSchedule] = await Promise.all([
    loadPersistedRoleSchedule("cutter"),
    loadPersistedRoleSchedule("assembler"),
    loadPersistedRoleSchedule("qc"),
  ]);

  after(async () => {
    await reflowManufacturingSchedules("load_queue");
    revalidatePath("/management/schedule", "layout");
  });

  return (
    <ScheduleScreen
      cutterSchedule={cutterSchedule}
      assemblerSchedule={assemblerSchedule}
      qcSchedule={qcSchedule}
    />
  );
}
