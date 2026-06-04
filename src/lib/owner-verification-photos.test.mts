import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_OWNER_VERIFICATION_NOTE_LENGTH,
  normalizeOwnerVerificationNote,
  validateOwnerVerificationNote,
} from "./owner-verification-photos.ts";

test("normalizeOwnerVerificationNote trims and normalizes line endings", () => {
  assert.equal(normalizeOwnerVerificationNote("  first\r\nsecond  "), "first\nsecond");
  assert.equal(normalizeOwnerVerificationNote(null), "");
});

test("validateOwnerVerificationNote enforces note length", () => {
  assert.equal(validateOwnerVerificationNote("ok"), null);
  assert.match(
    validateOwnerVerificationNote("x".repeat(MAX_OWNER_VERIFICATION_NOTE_LENGTH + 1)) ?? "",
    /1000 characters or less/
  );
});
