import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_OWNER_VERIFICATION_NOTE_LENGTH,
  getRemainingOwnerVerificationPhotoSlots,
  normalizeOwnerVerificationNote,
  validateOwnerVerificationNote,
} from "./owner-verification-photos.ts";

test("getRemainingOwnerVerificationPhotoSlots caps owner photos at six", () => {
  assert.equal(getRemainingOwnerVerificationPhotoSlots(0), 6);
  assert.equal(getRemainingOwnerVerificationPhotoSlots(5), 1);
  assert.equal(getRemainingOwnerVerificationPhotoSlots(6), 0);
  assert.equal(getRemainingOwnerVerificationPhotoSlots(9), 0);
  assert.equal(getRemainingOwnerVerificationPhotoSlots(-2), 6);
});

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
