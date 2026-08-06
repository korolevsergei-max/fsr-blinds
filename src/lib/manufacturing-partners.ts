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
