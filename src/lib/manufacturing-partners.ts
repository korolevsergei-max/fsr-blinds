import type { ManufacturingPartner } from "./types.ts";

/**
 * The DEFAULT station's partner row — Station A, seeded by migration
 * 20260806120000 and renamed by 20260814120000.
 *
 * `units.manufacturing_partner_id` defaults to this, so every unit that predates
 * subcontracting — and every unit created since without an explicit choice — is
 * Station A's.
 *
 * ⚠️ This is the column DEFAULT, not "the internal one". Since stations landed
 * there are several rows with `is_internal = true` (Station A, Station B, …), so
 * `id === INTERNAL_PARTNER_ID` is NOT a test for in-house work — that is what
 * `isInternalPartner` below is for, and why the old `isInternalPartnerId` helper
 * was deleted rather than kept. Using this constant as an internality test would
 * silently classify Station B as a subcontractor.
 */
export const INTERNAL_PARTNER_ID = "mp-internal";

/** Ids of every in-house station in `partners`. */
export function internalPartnerIds(partners: ManufacturingPartner[]): Set<string> {
  return new Set(partners.filter((p) => p.isInternal).map((p) => p.id));
}

/**
 * Is this partner one of our own stations? Resolved from the partner list rather
 * than a constant, because there is more than one internal row.
 *
 * An ABSENT partner id reads as internal — the column default above, which
 * predates every unit. An id that is not in the list reads as external: the safe
 * direction for a stale list, since the in-house queues are additionally gated by
 * `manufacturing_assigned_at` and the DB trigger is the real guard.
 */
export function isInternalPartner(
  partnerId: string | null | undefined,
  partners: ManufacturingPartner[]
): boolean {
  const id = partnerId ?? INTERNAL_PARTNER_ID;
  return partners.some((p) => p.id === id && p.isInternal);
}

/**
 * Is this unit the given station's work? Two conditions, and the asymmetry
 * between them is load-bearing:
 *
 *  - partner ABSENT reads as Station A — the column default above.
 *  - routing ABSENT (`undefined` — the read path did not project the column)
 *    reads as ROUTED. Only an explicit NULL means "nobody has decided yet".
 *
 * Inverting that second default is how you empty every factory queue at once:
 * any query that forgets `manufacturing_assigned_at` would suddenly report the
 * whole floor as undecided and the cutter/assembler/QC screens would go blank.
 * `manufacturing-partners.test.mts` pins both directions.
 *
 * `stationId` is required on purpose. Defaulting it would let a caller that
 * forgot to resolve the viewer's station silently fall back to Station A and
 * show one station another's work.
 */
export function isStationWork(
  unit: {
    manufacturing_partner_id?: string | null;
    manufacturing_assigned_at?: string | null;
  },
  stationId: string
): boolean {
  if ((unit.manufacturing_partner_id ?? INTERNAL_PARTNER_ID) !== stationId) return false;
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
 * back to the default station — the safe direction, since the trigger is the real
 * guard and locking the factory out of its own work would be the worse failure.
 */
export function resolveFactoryManufacturer(
  partnerId: string | null | undefined,
  partner: { name?: string | null; is_internal?: boolean | null } | null | undefined
): FactoryUnitManufacturer {
  const id = partnerId ?? INTERNAL_PARTNER_ID;
  // No partner list here (this is a single-row embed), so the only fallback
  // available is the column default. See the constant's warning: this is the one
  // place where comparing against it is legitimate.
  const internal = partner?.is_internal ?? id === INTERNAL_PARTNER_ID;
  return {
    partnerId: id,
    partnerName: partner?.name ?? (internal ? "Station A" : id),
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
 * Options for the assign pickers and the dashboard filter: our own stations
 * first (by name, so Station A precedes Station B), then subcontractors by name.
 * Mirrors the ORDER BY in get_owner_dataset.
 */
export function sortPartners(partners: ManufacturingPartner[]): ManufacturingPartner[] {
  return [...partners].sort((a, b) => {
    if (a.isInternal !== b.isInternal) return a.isInternal ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
