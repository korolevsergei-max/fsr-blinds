import assert from "node:assert/strict";
import test from "node:test";

import { matchesQueueSearch } from "./queue-search.ts";

const baseItem = {
  unitNumber: "1403",
  buildingName: "Lansdowne Building B",
  roomName: "Bedroom 1",
  label: "Window 2",
};

test("empty search matches everything", () => {
  assert.equal(matchesQueueSearch(baseItem, ""), true);
  assert.equal(matchesQueueSearch(baseItem, "   "), true);
  assert.equal(matchesQueueSearch(baseItem, ","), true);
});

test("single token does substring match across fields", () => {
  assert.equal(matchesQueueSearch(baseItem, "1403"), true);
  assert.equal(matchesQueueSearch(baseItem, "lansdowne"), true);
  assert.equal(matchesQueueSearch(baseItem, "bedroom"), true);
  assert.equal(matchesQueueSearch(baseItem, "window 2"), true);
  assert.equal(matchesQueueSearch(baseItem, "1499"), false);
  assert.equal(matchesQueueSearch(baseItem, "kitchen"), false);
});

test("single token is case-insensitive", () => {
  assert.equal(matchesQueueSearch(baseItem, "BEDROOM"), true);
  assert.equal(matchesQueueSearch(baseItem, "LANSDOWNE"), true);
});

test("single token can partial-match unit number", () => {
  assert.equal(matchesQueueSearch(baseItem, "140"), true);
});

test("multi-token all-digits = OR exact match on unit number", () => {
  assert.equal(matchesQueueSearch(baseItem, "1403, 1805"), true);
  assert.equal(matchesQueueSearch({ ...baseItem, unitNumber: "1805" }, "1403, 1805"), true);
  assert.equal(matchesQueueSearch({ ...baseItem, unitNumber: "2001" }, "1403, 1805"), false);
});

test("multi-token all-digits requires exact match (no substring)", () => {
  assert.equal(matchesQueueSearch(baseItem, "140, 180"), false);
  assert.equal(matchesQueueSearch(baseItem, "14, 18"), false);
});

test("mixed-token AND across heterogeneous fields", () => {
  assert.equal(matchesQueueSearch(baseItem, "building b, 1403, bedroom"), true);
  assert.equal(matchesQueueSearch(baseItem, "lansdowne, window 2"), true);
  assert.equal(matchesQueueSearch(baseItem, "lansdowne, kitchen"), false);
  assert.equal(matchesQueueSearch(baseItem, "1403, lobby"), false);
});

test("single digits-only token uses substring not exact-match", () => {
  assert.equal(matchesQueueSearch(baseItem, "140"), true);
  assert.equal(matchesQueueSearch(baseItem, "14"), true);
});

test("whitespace tokens are trimmed", () => {
  assert.equal(matchesQueueSearch(baseItem, "  1403  ,  1805  "), true);
});

test("handles null/undefined fields without crashing", () => {
  const item = { unitNumber: null, buildingName: null, roomName: null, label: null };
  assert.equal(matchesQueueSearch(item, ""), true);
  assert.equal(matchesQueueSearch(item, "anything"), false);
});
