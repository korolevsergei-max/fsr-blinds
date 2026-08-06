/**
 * Decimal inches → mixed fraction, for the subcontractor's work list.
 *
 * Their shop floor reads tape measures, not decimals: 35.5 must print as
 * `35 1/2`, not `35.5"`. Measurements originate from installer tape readings, so
 * they land on sixteenths — 35.4375 (7/16), 20.6875 (11/16), 75.625 (5/8) are all
 * exact at 1/16. Anything that is not is rounded to the nearest sixteenth, which
 * is finer than the material tolerance and is what a cutter would do anyway.
 *
 * Internal decimals are left untouched everywhere else; this is a display and
 * export concern only.
 */

const DENOMINATOR = 16;

export function toFractionInches(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";

  const negative = value < 0;
  const abs = Math.abs(value);

  const totalSixteenths = Math.round(abs * DENOMINATOR);
  let whole = Math.floor(totalSixteenths / DENOMINATOR);
  let numerator = totalSixteenths % DENOMINATOR;

  if (numerator === 0) return `${negative ? "-" : ""}${whole}`;

  // Reduce: 8/16 → 1/2, 12/16 → 3/4, 6/16 → 3/8.
  let denominator = DENOMINATOR;
  while (numerator % 2 === 0 && denominator % 2 === 0) {
    numerator /= 2;
    denominator /= 2;
  }

  // Rounding can carry into the whole number (e.g. 35.9999 → 36).
  if (numerator === denominator) {
    whole += 1;
    return `${negative ? "-" : ""}${whole}`;
  }

  const sign = negative ? "-" : "";
  return whole === 0
    ? `${sign}${numerator}/${denominator}`
    : `${sign}${whole} ${numerator}/${denominator}`;
}
