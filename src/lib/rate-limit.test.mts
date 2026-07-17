import assert from "node:assert/strict";
import test from "node:test";
import { consumeRateLimit, type RateLimitRule } from "./rate-limit.ts";

const RULE: RateLimitRule = { capacity: 3, refillPerSecond: 1 };

test("allows a burst up to capacity, then throttles", () => {
  const t0 = 1_000_000;
  assert.equal(consumeRateLimit("burst", RULE, t0), true);
  assert.equal(consumeRateLimit("burst", RULE, t0), true);
  assert.equal(consumeRateLimit("burst", RULE, t0), true);
  assert.equal(consumeRateLimit("burst", RULE, t0), false, "4th call in the same instant is throttled");
});

test("refills over time at refillPerSecond", () => {
  const t0 = 2_000_000;
  for (let i = 0; i < 3; i++) consumeRateLimit("refill", RULE, t0);
  assert.equal(consumeRateLimit("refill", RULE, t0), false);

  // 500ms later: only half a token — still throttled.
  assert.equal(consumeRateLimit("refill", RULE, t0 + 500), false);
  // Another 600ms later: past one full token — allowed again, then empty.
  assert.equal(consumeRateLimit("refill", RULE, t0 + 1_100), true);
  assert.equal(consumeRateLimit("refill", RULE, t0 + 1_100), false);
});

test("refill never exceeds capacity", () => {
  const t0 = 3_000_000;
  assert.equal(consumeRateLimit("cap", RULE, t0), true);
  // A long idle period must not bank more than `capacity` tokens.
  const later = t0 + 60_000;
  for (let i = 0; i < 3; i++) {
    assert.equal(consumeRateLimit("cap", RULE, later), true, `call ${i + 1} after idle`);
  }
  assert.equal(consumeRateLimit("cap", RULE, later), false);
});

test("keys are independent", () => {
  const t0 = 4_000_000;
  for (let i = 0; i < 3; i++) consumeRateLimit("user-a", RULE, t0);
  assert.equal(consumeRateLimit("user-a", RULE, t0), false);
  assert.equal(consumeRateLimit("user-b", RULE, t0), true, "a throttled user must not affect another");
});

test("clock going backwards does not refund tokens", () => {
  const t0 = 5_000_000;
  for (let i = 0; i < 3; i++) consumeRateLimit("clock", RULE, t0);
  assert.equal(consumeRateLimit("clock", RULE, t0 - 10_000), false);
});
