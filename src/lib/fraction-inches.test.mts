import { test } from "node:test";
import assert from "node:assert/strict";

import { toFractionInches } from "./fraction-inches.ts";

test("renders whole numbers without a fraction", () => {
  assert.equal(toFractionInches(88), "88");
  assert.equal(toFractionInches(0), "0");
});

test("reduces to the largest sensible denominator", () => {
  assert.equal(toFractionInches(35.5), "35 1/2");
  assert.equal(toFractionInches(34.125), "34 1/8");
  assert.equal(toFractionInches(75.625), "75 5/8");
  assert.equal(toFractionInches(19.375), "19 3/8");
  assert.equal(toFractionInches(20.75), "20 3/4");
});

test("keeps sixteenths that do not reduce", () => {
  assert.equal(toFractionInches(35.4375), "35 7/16");
  assert.equal(toFractionInches(20.6875), "20 11/16");
  assert.equal(toFractionInches(76.9375), "76 15/16");
});

test("rounds to the nearest sixteenth", () => {
  assert.equal(toFractionInches(35.51), "35 1/2");
  assert.equal(toFractionInches(35.44), "35 7/16");
});

test("carries a rounded fraction into the whole number", () => {
  assert.equal(toFractionInches(35.9999), "36");
});

test("handles values below one inch", () => {
  assert.equal(toFractionInches(0.5), "1/2");
  assert.equal(toFractionInches(0.0625), "1/16");
});

test("returns empty for missing measurements", () => {
  assert.equal(toFractionInches(null), "");
  assert.equal(toFractionInches(undefined), "");
  assert.equal(toFractionInches(Number.NaN), "");
});
