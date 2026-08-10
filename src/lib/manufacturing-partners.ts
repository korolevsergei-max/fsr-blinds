import type { ManufacturingPartner } from "./types.ts";

/**
 * The in-house factory's partner row, seeded by migration 20260806120000.
 *
 * `units.manufacturing_partner_id` defaults to this, so every unit that predates
 * subcontracting — and every unit created since without an explicit choice — is
 * internal. A partial unique index on `manufacturing_partners (is_internal)
 * WHERE is_internal` guarantees this id is the only internal row, which is what
 * lets the reflow compare against a constant instead of joining.
 */
export const INTERNAL_PARTNER_ID = "mp-internal";

export function isInternalPartnerId(partnerId: string | null | undefined): boolean {
  return (partnerId ?? INTERNAL_PARTNER_ID) === INTERNAL_PARTNER_ID;
}

/**
 * Is this unit the in-house factory's work? Two conditions, and the asymmetry
 * between them is load-bearing:
 *
 *  - partner ABSENT reads as internal — the default above, because the column
 *    defaults to `mp-internal` and predates every unit.
 *  - routing ABSENT (`undefined` — the read path did not project the column)
 *    reads as ROUTED. Only an explicit NULL means "nobody has decided yet".
 *
 * Inverting that second default is how you empty every factory queue at once:
 * any query that forgets `manufacturing_assigned_at` would suddenly report the
 * whole floor as undecided and the cutter/assembler/QC screens would go blank.
 * `manufacturing-partners.test.mts` pins both directions.
 */
export function isInternalFactoryWork(unit: {
  manufacturing_partner_id?: string | null;
  manufacturing_assigned_at?: string | null;
}): boolean {
  if (!isInternalPartnerId(unit.manufacturing_partner_id)) return false;
  return unit.manufacturing_assigned_at !== null;
}

/**
 * Who builds this unit, resolved for the factory portals' unit-detail screens.
 * `isInternal` false means the in-house mark buttons must be hidden — the DB
 * trigger would reject the write anyway, but a cutter should learn that from the
 * screen rather than from a failed click after the blind is already cut.
 */
export interface FactoryUnitManufacturer {
  partnerId: string;
  partnerName: string;
  isInternal: boolean;
}

/**
 * Normalises the embedded `manufacturing_partners` row a factory detail query
 * returns. A missing embed (stale RLS, a partner row deleted mid-request) falls
 * back to in-house, matching `isInternalPartnerId` — the safe direction, since
 * the trigger is the real guard and locking the factory out of its own work
 * would be the worse failure.
 */
export function resolveFactoryManufacturer(
  partnerId: string | null | undefined,
  partner: { name?: string | null; is_internal?: boolean | null } | null | undefined
): FactoryUnitManufacturer {
  const id = partnerId ?? INTERNAL_PARTNER_ID;
  const internal = partner?.is_internal ?? isInternalPartnerId(id);
  return {
    partnerId: id,
    partnerName: partner?.name ?? (internal ? "FSR Internal" : id),
    isInternal: internal,
  };
}

/** Display name for a unit's partner; falls back to the id when the list is stale. */
export function partnerNameFor(
  partnerId: string | null | undefined,
  partners: ManufacturingPartner[]
): string {
  const id = partnerId ?? INTERNAL_PARTNER_ID;
  return partners.find((p) => p.id === id)?.name ?? id;
}

/**
 * Options for the assign pickers and the dashboard filter: internal first, then
 * subcontractors by name. Mirrors the ORDER BY in get_owner_dataset.
 */
export function sortPartners(partners: ManufacturingPartner[]): ManufacturingPartner[] {
  return [...partners].sort((a, b) => {
    if (a.isInternal !== b.isInternal) return a.isInternal ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
