import { test } from "node:test";
import assert from "node:assert/strict";

import {
  INTERNAL_PARTNER_ID,
  isInternalPartnerId,
  partnerNameFor,
  sortPartners,
} from "./manufacturing-partners.ts";
import type { ManufacturingPartner } from "./types.ts";

const internal: ManufacturingPartner = {
  id: INTERNAL_PARTNER_ID,
  name: "FSR Internal",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  isInternal: true,
};

const acme: ManufacturingPartner = {
  id: "mp-acme",
  name: "Acme Blinds",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  isInternal: false,
};

/**
 * The exclusivity invariant depends on this default: a unit whose partner is
 * unknown (an RPC path that does not project the column, a pre-migration row)
 * must read as INTERNAL. Treating it as external instead would silently drop
 * real units out of the in-house factory queues with nobody building them.
 */
test("a missing partner id means in-house", () => {
  assert.equal(isInternalPartnerId(null), true);
  assert.equal(isInternalPartnerId(undefined), true);
  assert.equal(isInternalPartnerId(INTERNAL_PARTNER_ID), true);
});

test("any other partner id is external", () => {
  assert.equal(isInternalPartnerId("mp-acme"), false);
  assert.equal(isInternalPartnerId(""), false);
});

test("internal and external are mutually exclusive for every id", () => {
  for (const id of [null, undefined, INTERNAL_PARTNER_ID, "mp-acme", "mp-other"]) {
    const internalSide = isInternalPartnerId(id);
    const externalSide = !isInternalPartnerId(id);
    assert.notEqual(internalSide, externalSide, `id ${String(id)} landed on both sides`);
  }
});

test("partnerNameFor resolves through the list and falls back to in-house", () => {
  assert.equal(partnerNameFor("mp-acme", [internal, acme]), "Acme Blinds");
  assert.equal(partnerNameFor(null, [internal, acme]), "FSR Internal");
  assert.equal(partnerNameFor("mp-gone", [internal, acme]), "mp-gone");
});

test("sortPartners puts in-house first, then external by name", () => {
  const zeta: ManufacturingPartner = { ...acme, id: "mp-zeta", name: "Zeta" };
  const sorted = sortPartners([zeta, acme, internal]);
  assert.deepEqual(sorted.map((p) => p.id), [INTERNAL_PARTNER_ID, "mp-acme", "mp-zeta"]);
});

test("sortPartners does not mutate its input", () => {
  const input = [acme, internal];
  sortPartners(input);
  assert.deepEqual(input.map((p) => p.id), ["mp-acme", INTERNAL_PARTNER_ID]);
});
