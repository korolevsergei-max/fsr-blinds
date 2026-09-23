/**
 * Reconciling a factory screen's local list with a fresh server snapshot.
 *
 * A refresh can be fetched while a mark is still in flight, or be served from a
 * read that began just before the write committed. Taking such a snapshot at
 * face value puts blinds the operator already cleared back on screen, and they
 * get cleared a second time. Two sets guard against that:
 *
 *   - `inFlight`: writes not yet answered by the server.
 *   - `settling`: windowId → server `confirmedAt` of a write that succeeded but
 *     that a snapshot has not provably caught up with yet.
 *
 * A snapshot proves it has caught up with a write when its read began after
 * the write was confirmed (`loadedAt > confirmedAt`). Both timestamps are
 * server-issued ISO strings, so they compare lexically.
 */
export type SettlingWrites = ReadonlyMap<string, string>;

export function pruneSettledWrites(
  settling: SettlingWrites,
  loadedAt: string | undefined
): Map<string, string> {
  // A snapshot without a read time cannot be compared; trust it.
  if (!loadedAt) return new Map();
  return new Map([...settling].filter(([, confirmedAt]) => confirmedAt >= loadedAt));
}

export function reconcileSnapshot<T extends { windowId: string }>(
  serverItems: T[],
  inFlight: ReadonlySet<string>,
  settling: SettlingWrites
): T[] {
  if (inFlight.size === 0 && settling.size === 0) return serverItems;
  return serverItems.filter(
    (item) => !inFlight.has(item.windowId) && !settling.has(item.windowId)
  );
}
