/**
 * Lightweight, hand-rolled runtime contract checks for the RPC ↔ TS boundary
 * (quality floor, D2). Our RPC payloads are `as`-cast with no validation, so a
 * SQL/TS drift (a renamed column, a shape change in a migration) fails silently
 * or deep in a render instead of at the boundary.
 *
 * These checks are FAIL-SOFT: on a mismatch they emit a `[contract]`
 * console.warn (which survives prod builds via the removeConsole warn-exclude)
 * and return false — they never throw. Callers already default missing arrays to
 * `[]`, so a drift degrades to an empty section plus a loud prod-log signal,
 * never a crash.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function warnContract(context: string, message: string): void {
  console.warn(`[contract] ${context}: ${message}`);
}

/**
 * Assert an RPC payload is an object whose listed keys, when present, are arrays.
 * A key that is absent is tolerated (the TS side defaults it); a key that is
 * present but not an array is the drift we want to catch. Returns whether every
 * check passed.
 */
export function assertRpcArrays(
  context: string,
  payload: unknown,
  keys: readonly string[]
): boolean {
  if (!isRecord(payload)) {
    warnContract(context, `expected an object payload, got ${payload === null ? "null" : typeof payload}`);
    return false;
  }
  let ok = true;
  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null && !Array.isArray(value)) {
      warnContract(context, `expected "${key}" to be an array, got ${typeof value}`);
      ok = false;
    }
  }
  return ok;
}
