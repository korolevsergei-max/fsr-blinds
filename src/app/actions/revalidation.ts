"use server";

import { revalidatePath } from "next/cache";

type UnitRouteOptions = {
  buildingId?: string | null;
  clientId?: string | null;
};

function revalidateManagementIndexPages() {
  revalidatePath("/management");
  revalidatePath("/management/clients");
  revalidatePath("/management/installers");
  revalidatePath("/management/reports");
  revalidatePath("/management/schedule");
  revalidatePath("/management/units");
}

function revalidateScopedPortalLayouts() {
  revalidatePath("/scheduler", "layout");
  revalidatePath("/installer", "layout");
}

export async function revalidateAllPortalData() {
  revalidateManagementIndexPages();
  revalidatePath("/management/settings");
  revalidateScopedPortalLayouts();
}

export async function revalidateClientRoutes(clientId: string) {
  revalidateManagementIndexPages();
  revalidatePath(`/management/clients/${clientId}`);
  revalidateScopedPortalLayouts();
}

export async function revalidateBuildingRoutes(buildingId: string, clientId?: string | null) {
  revalidateManagementIndexPages();
  revalidatePath(`/management/buildings/${buildingId}`);
  revalidatePath(`/management/buildings/${buildingId}/import`);
  if (clientId) {
    revalidatePath(`/management/clients/${clientId}`);
  }
  revalidateScopedPortalLayouts();
}

export async function revalidateUnitRoutes(unitId: string, options: UnitRouteOptions = {}) {
  revalidateManagementIndexPages();
  revalidatePath(`/management/units/${unitId}`);
  revalidatePath(`/management/units/${unitId}/assign`);
  revalidatePath(`/management/units/${unitId}/dates`);
  revalidatePath(`/management/units/${unitId}/status`);

  if (options.buildingId) {
    revalidatePath(`/management/buildings/${options.buildingId}`);
    revalidatePath(`/management/buildings/${options.buildingId}/import`);
  }
  if (options.clientId) {
    revalidatePath(`/management/clients/${options.clientId}`);
  }

  revalidatePath(`/scheduler/units/${unitId}`);
  revalidatePath(`/scheduler/units/${unitId}/assign`);
  revalidatePath(`/scheduler/units/${unitId}/dates`);
  revalidatePath(`/scheduler/units/${unitId}/status`);
  revalidatePath(`/scheduler/units/${unitId}/summary`);

  revalidatePath(`/installer/units/${unitId}`);
  revalidatePath(`/installer/units/${unitId}/status`);
  revalidatePath(`/installer/units/${unitId}/summary`);

  revalidateScopedPortalLayouts();
}

export async function revalidateManyUnitRoutes(
  units: Array<{ id: string; buildingId?: string | null; clientId?: string | null }>
) {
  revalidateManagementIndexPages();
  revalidateScopedPortalLayouts();

  const buildingIds = new Set<string>();
  const clientIds = new Set<string>();

  for (const unit of units) {
    revalidatePath(`/management/units/${unit.id}`);
    revalidatePath(`/management/units/${unit.id}/assign`);
    revalidatePath(`/management/units/${unit.id}/dates`);
    revalidatePath(`/management/units/${unit.id}/status`);

    revalidatePath(`/scheduler/units/${unit.id}`);
    revalidatePath(`/scheduler/units/${unit.id}/assign`);
    revalidatePath(`/scheduler/units/${unit.id}/dates`);
    revalidatePath(`/scheduler/units/${unit.id}/status`);
    revalidatePath(`/scheduler/units/${unit.id}/summary`);

    revalidatePath(`/installer/units/${unit.id}`);
    revalidatePath(`/installer/units/${unit.id}/status`);
    revalidatePath(`/installer/units/${unit.id}/summary`);

    if (unit.buildingId) {
      buildingIds.add(unit.buildingId);
    }
    if (unit.clientId) {
      clientIds.add(unit.clientId);
    }
  }

  for (const buildingId of buildingIds) {
    revalidatePath(`/management/buildings/${buildingId}`);
    revalidatePath(`/management/buildings/${buildingId}/import`);
  }

  for (const clientId of clientIds) {
    revalidatePath(`/management/clients/${clientId}`);
  }
}
