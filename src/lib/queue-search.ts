type SearchableWindow = {
  unitNumber: string | null | undefined;
  buildingName: string | null | undefined;
  roomName: string | null | undefined;
  label: string | null | undefined;
};

export function matchesQueueSearch(item: SearchableWindow, search: string): boolean {
  const trimmed = search.trim();
  if (!trimmed) return true;

  const tokens = trimmed
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const unitNumber = (item.unitNumber ?? "").trim().toLowerCase();
  const allDigits = tokens.every((t) => /^\d+$/.test(t));
  if (tokens.length > 1 && allDigits) {
    return tokens.includes(unitNumber);
  }

  const haystacks = [
    unitNumber,
    (item.buildingName ?? "").toLowerCase(),
    (item.roomName ?? "").toLowerCase(),
    (item.label ?? "").toLowerCase(),
  ];
  return tokens.every((t) => haystacks.some((h) => h.includes(t)));
}
