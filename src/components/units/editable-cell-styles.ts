/**
 * Shared "this row is editable" treatment for the unit-detail assignment cards.
 *
 * The owner/scheduler unit screens used to signal editability with a separate row of
 * header buttons (Key dates / Installer / Scheduler) while the values themselves looked
 * like static text. The buttons were removed as duplicative, so the affordance now has to
 * live on the values: a pale accent wash plus accent-coloured text marks every cell you
 * can act on, and untinted cells are read-only.
 *
 * `--accent-light` (#e6faf7) is deliberately near-white so a card of six tinted cells
 * still reads as a card rather than a green block.
 */
/** Tint + layout without padding, for callers that set their own (e.g. `surface-card p-4`). */
export const EDITABLE_CELL_BASE =
  "flex items-center gap-3 bg-accent-light transition-colors hover:bg-accent-muted";

/** Grid-cell variant: `EDITABLE_CELL_BASE` plus the assignment card's own padding. */
export const EDITABLE_CELL = `${EDITABLE_CELL_BASE} px-4 py-3`;

/** Value text inside an editable cell. Pair with `EDITABLE_CELL`. */
export const EDITABLE_VALUE = "text-[13px] font-semibold text-accent";
