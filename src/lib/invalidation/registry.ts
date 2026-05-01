// Additive — old revalidation.ts still in use; migrate callers one at a time.
"use server";

import { revalidatePath } from "next/cache";

export type InvalidationEvent =
  | { kind: "unit.updated"; unitId: string }
  | { kind: "unit.window.changed"; unitId: string; windowId: string }
  | { kind: "unit.room.changed"; unitId: string; roomId: string }
  | { kind: "unit.media.changed"; unitId: string }
  | { kind: "manufacturing.queue.changed" }
  | { kind: "management.dashboard.changed" };

export function invalidate(event: InvalidationEvent): void {
  switch (event.kind) {
    case "unit.updated": {
      const { unitId } = event;
      // management index pages (revalidateManagementIndexPages)
      revalidatePath("/management");
      revalidatePath("/management/clients");
      revalidatePath("/management/installers");
      revalidatePath("/management/reports");
      revalidatePath("/management/schedule");
      revalidatePath("/management/units");
      // management unit detail pages
      revalidatePath(`/management/units/${unitId}`);
      revalidatePath(`/management/units/${unitId}/assign`);
      revalidatePath(`/management/units/${unitId}/dates`);
      revalidatePath(`/management/units/${unitId}/status`);
      // scheduler unit pages
      revalidatePath(`/scheduler/units/${unitId}`);
      revalidatePath(`/scheduler/units/${unitId}/assign`);
      revalidatePath(`/scheduler/units/${unitId}/dates`);
      revalidatePath(`/scheduler/units/${unitId}/status`);
      revalidatePath(`/scheduler/units/${unitId}/summary`);
      // installer unit pages
      revalidatePath(`/installer/units/${unitId}`);
      revalidatePath(`/installer/units/${unitId}/status`);
      revalidatePath(`/installer/units/${unitId}/summary`);
      // portal layouts
      revalidatePath("/scheduler", "layout");
      revalidatePath("/installer", "layout");
      break;
    }

    case "unit.window.changed": {
      const { unitId } = event;
      // manufacturing portal paths (production-actions + manufacturing-actions union)
      revalidatePath("/management/settings", "page");
      revalidatePath("/management/schedule", "page");
      revalidatePath("/cutter", "layout");
      revalidatePath("/assembler", "layout");
      revalidatePath("/qc", "layout");
      revalidatePath("/management", "layout");
      // unit status pages — window progress affects unit completion
      revalidatePath(`/management/units/${unitId}`);
      revalidatePath(`/management/units/${unitId}/status`);
      revalidatePath(`/scheduler/units/${unitId}`);
      revalidatePath(`/scheduler/units/${unitId}/status`);
      revalidatePath(`/scheduler/units/${unitId}/summary`);
      revalidatePath(`/installer/units/${unitId}`);
      revalidatePath(`/installer/units/${unitId}/status`);
      revalidatePath(`/installer/units/${unitId}/summary`);
      break;
    }

    case "unit.room.changed": {
      const { unitId } = event;
      // management index + unit detail pages
      revalidatePath("/management");
      revalidatePath("/management/units");
      revalidatePath(`/management/units/${unitId}`);
      revalidatePath(`/management/units/${unitId}/assign`);
      revalidatePath(`/management/units/${unitId}/dates`);
      revalidatePath(`/management/units/${unitId}/status`);
      // scheduler + installer unit pages
      revalidatePath(`/scheduler/units/${unitId}`);
      revalidatePath(`/scheduler/units/${unitId}/status`);
      revalidatePath(`/scheduler/units/${unitId}/summary`);
      revalidatePath(`/installer/units/${unitId}`);
      revalidatePath(`/installer/units/${unitId}/status`);
      revalidatePath(`/installer/units/${unitId}/summary`);
      // portal layouts
      revalidatePath("/scheduler", "layout");
      revalidatePath("/installer", "layout");
      break;
    }

    case "unit.media.changed": {
      const { unitId } = event;
      // unit detail pages that display media
      revalidatePath(`/management/units/${unitId}`);
      revalidatePath(`/scheduler/units/${unitId}`);
      revalidatePath(`/scheduler/units/${unitId}/summary`);
      revalidatePath(`/installer/units/${unitId}`);
      revalidatePath(`/installer/units/${unitId}/summary`);
      break;
    }

    case "manufacturing.queue.changed": {
      // revalidateManufacturingPaths + revalidateAll union
      revalidatePath("/management/settings", "page");
      revalidatePath("/management/schedule", "page");
      revalidatePath("/cutter", "layout");
      revalidatePath("/assembler", "layout");
      revalidatePath("/qc", "layout");
      revalidatePath("/management", "layout");
      break;
    }

    case "management.dashboard.changed": {
      // revalidateManagementIndexPages
      revalidatePath("/management");
      revalidatePath("/management/clients");
      revalidatePath("/management/installers");
      revalidatePath("/management/reports");
      revalidatePath("/management/schedule");
      revalidatePath("/management/units");
      break;
    }
  }
}
