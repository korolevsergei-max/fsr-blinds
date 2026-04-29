# FSR Blinds — Handoff Plan (2026-04-28)

> **Read first:** This doc is sequential. Don't skip ahead — later tasks depend on earlier schema/types. Each task lists files with line refs, exact strings, and an "Acceptance" check. Where you see `VERIFY`, stop and confirm against current code before changing.

---

## Phase 0 — Foundation

### T0.1 — Schema migrations (single migration file)

Create one migration file: `supabase/migrations/20260428120000_label_printing_issues_snapshots.sql`

Contents:

```sql
-- 1. Per-window label print tracking
ALTER TABLE window_production_status
  ADD COLUMN IF NOT EXISTS manufacturing_label_printed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS packaging_label_printed_at     TIMESTAMPTZ NULL;

-- 2. Per-window post-install issues with full history
CREATE TABLE IF NOT EXISTS window_post_install_issues (
  id          TEXT PRIMARY KEY,
  window_id   TEXT NOT NULL REFERENCES windows(id) ON DELETE CASCADE,
  unit_id     TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  opened_by_user_id   UUID NOT NULL REFERENCES auth.users(id),
  opened_by_role      TEXT NOT NULL CHECK (opened_by_role IN ('owner','scheduler')),
  opened_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by_user_id UUID NULL REFERENCES auth.users(id),
  resolved_at         TIMESTAMPTZ NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wpii_window ON window_post_install_issues(window_id);
CREATE INDEX IF NOT EXISTS idx_wpii_unit_open ON window_post_install_issues(unit_id) WHERE status = 'open';

-- Notes/comments thread per issue (full history)
CREATE TABLE IF NOT EXISTS window_post_install_issue_notes (
  id          TEXT PRIMARY KEY,
  issue_id    TEXT NOT NULL REFERENCES window_post_install_issues(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES auth.users(id),
  author_role TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wpiin_issue ON window_post_install_issue_notes(issue_id);

-- 3. Daily progress snapshots for the Progress Report
-- One row per (snapshot_date, stage, unit). Captured by daily job at 00:05 America/Toronto.
CREATE TABLE IF NOT EXISTS daily_progress_snapshots (
  id              TEXT PRIMARY KEY,
  snapshot_date   DATE NOT NULL,
  stage           TEXT NOT NULL CHECK (stage IN ('measurement','bracketing','cutting','assembling','qc','installation','post_install_issue')),
  unit_id         TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  building_id     TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  client_id       TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  floor           INTEGER NULL,
  expected_blinds INTEGER NOT NULL,
  done_blinds     INTEGER NOT NULL,
  assigned_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  assigned_display TEXT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, stage, unit_id)
);
CREATE INDEX IF NOT EXISTS idx_dps_date_stage ON daily_progress_snapshots(snapshot_date, stage);
```

**Acceptance:** `supabase db reset` runs cleanly. `\d window_production_status`, `\d window_post_install_issues`, `\d daily_progress_snapshots` show new columns/tables.

---

### T0.2 — Stage taxonomy in TypeScript

Edit `src/lib/types.ts`.

Add (don't break existing `UNIT_STATUSES`):

```ts
export const PROGRESS_STAGES = [
  "measurement",
  "bracketing",
  "cutting",
  "assembling",
  "qc",
  "installation",
  "post_install_issue",
] as const;
export type ProgressStage = (typeof PROGRESS_STAGES)[number];

export const PROGRESS_STAGE_LETTERS: Record<ProgressStage, string> = {
  measurement: "M",
  bracketing: "B",
  cutting: "C",
  assembling: "A",
  qc: "Q",
  installation: "I",
  post_install_issue: "PI",
};

export const PROGRESS_STAGE_LABELS: Record<ProgressStage, string> = {
  measurement: "Measurement",
  bracketing: "Bracketing",
  cutting: "Cutting",
  assembling: "Assembling",
  qc: "Quality Control",
  installation: "Installation",
  post_install_issue: "Post-Install Issue",
};
```

**Important rule for stage progress derivation** (used everywhere):
- `measurement` and `bracketing` are **parallel** — either can complete first; neither blocks the other. A unit progresses past "M+B" only when **both** are done.
- `cutting → assembling → qc` are **sequential per-window** (use `window_production_status.status`).
- `installation` requires QC complete on all windows.
- `post_install_issue` is a **flag** on a window that's already `installed`. It does not undo `installed` state; it adds an open-issue marker.

Add a single derivation helper in a new file `src/lib/progress-stage.ts`:

```ts
export type WindowStageState = {
  measured: boolean;
  bracketed: boolean;
  productionStatus: "pending" | "cut" | "assembled" | "qc_approved";
  installed: boolean;
  hasOpenPostInstallIssue: boolean;
};

export function deriveWindowStages(w: WindowStageState) {
  return {
    measurement: w.measured,
    bracketing: w.bracketed,
    cutting: w.productionStatus === "cut" || w.productionStatus === "assembled" || w.productionStatus === "qc_approved",
    assembling: w.productionStatus === "assembled" || w.productionStatus === "qc_approved",
    qc: w.productionStatus === "qc_approved",
    installation: w.installed,
    post_install_issue: w.hasOpenPostInstallIssue,
  };
}
```

**Acceptance:** `npm run typecheck` clean. Imports resolve.

---

## Phase 1 — Quick wins (no schema deps)

### T1.1 — Refresh button replaces "pull-to-refresh"

Create `src/components/ui/refresh-button.tsx`:

```tsx
"use client";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      aria-label="Refresh"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <ArrowsClockwise size={14} weight="bold" className={pending ? "animate-spin" : ""} />
    </Button>
  );
}
```

Add `<RefreshButton />` as the **first** child of the `actions` prop in every `<PageHeader>` across all portals. Files to edit (search for `<PageHeader` in `src/app/`):
- `src/app/management/**/*.tsx`
- `src/app/scheduler/**/*.tsx`
- `src/app/installer/**/*.tsx`
- `src/app/cutter/**/*.tsx`
- `src/app/assembler/**/*.tsx` (if exists)
- `src/app/manufacturer/**/*.tsx` (if still present)
- `src/app/qc/**/*.tsx`

`VERIFY` each file — only add to top-level page headers, not nested ones.

**Acceptance:** every primary page (dashboards, queues, unit detail, settings) has a circular-arrow refresh button at top-right. Clicking it spins the icon and calls `router.refresh()`. No browser pull-to-refresh code added.

---

### T1.2 — Add Units button consolidation

File: `src/app/management/buildings/[id]/building-detail.tsx`

Two changes:

**A. Remove the inline `+ Unit` button and its form** (lines 179-182 and the form at lines 219-251). Also remove the now-unused `showForm`, `unitNumber`, `completeByDate`, `handleCreateUnit` state/handlers above.

**B. Rename Import → "Units" with a `+` icon** (lines 148-153):

Replace:
```tsx
<Link href={`/management/buildings/${building.id}/import`}>
  <Button size="sm" variant="secondary">
    <UploadSimple size={14} weight="bold" />
    Import
  </Button>
</Link>
```

With:
```tsx
<Link href={`/management/buildings/${building.id}/import`}>
  <Button size="sm">
    <Plus size={14} weight="bold" />
    Units
  </Button>
</Link>
```

(Drop `UploadSimple` import, keep `Plus`.) Also confirm the import flow at `/management/buildings/[id]/import` supports adding a single unit. If it requires a CSV/list, leave a thin "Add one unit" preset on the import page itself — `VERIFY` and report if the import flow can't already handle 1.

**Acceptance:** building page shows a single primary "+ Units" button that takes you to the existing import page. No inline single-unit form.

---

### T1.3 — Rename "Invite X" → "Add X"

File: `src/app/management/accounts/accounts-manager.tsx:304`

Replace:
```tsx
{showForm ? `Close ${tabLabel} invite` : `Invite ${tabLabel}`}
```

With:
```tsx
{showForm ? `Close ${tabLabel}` : `Add ${tabLabel}`}
```

Also `VERIFY` `tabLabel` resolves to "Owners", "Cutters", "Quality Control", etc. (it should — it's derived from the tab switch at line 287-292).

Search the file for the string "invite" (case-insensitive) and replace any user-facing copy with "Add" / "Adding" equivalents. Component names like `InviteOwnerForm` stay as-is — no rename.

**Acceptance:** Accounts page shows "Add Owners", "Add Cutters", "Add Quality Control", etc.

---

### T1.4 — Owner unit detail title visibility

File: `src/app/management/units/[id]/management-unit-detail.tsx:338-340`

The title is already set; problem is action buttons crowding it. Two fixes:

**A.** Promote the title to always render `Unit ${unit.unitNumber}` (with the literal word "Unit") for clarity:
```tsx
<PageHeader
  title={`Unit ${unit.unitNumber}`}
  subtitle={`${unit.buildingName} • ${unit.clientName}`}
```

**B.** In `src/components/ui/page-header.tsx`, ensure the title is **always on its own row above actions**, never wrapped beside them. `VERIFY` current layout — if it's flex-row with actions, change to flex-col on `< sm` breakpoints (`flex-col sm:flex-row`).

**Acceptance:** owner unit detail page always shows "Unit 1207" (or whatever number) prominently at the top, even on iPhone-mini width with all four action buttons present.

---

## Phase 2 — Manufacturing process table fits one screen

### T2.1 — Eliminate horizontal scroll on manufacturing process

File: `src/components/manufacturing/manufacturing-process-screen.tsx:61-88` (`ManufacturingProcessTableColGroup`) and the table wrapper around line 600-605.

Changes:

**A.** Remove `overflow-auto` from the wrapper if present. Replace with `overflow-hidden`:
```tsx
<div className="flex-1 min-h-0 overflow-hidden">
```

**B.** Set the table to `width: 100%; table-layout: fixed` and use **percentage-only** col widths that sum to 100. Drop the `lg:w-[Xrem]` fixed pixel widths — they cause Chrome's content-box math to overflow:

```tsx
// showByUnit = false (7 columns: FL, DUE, BLINDS, CUT, ASSE, QC, INST)
<colgroup>
  <col style={{ width: "10%" }} /> {/* FL */}
  <col style={{ width: "18%" }} /> {/* DUE */}
  <col style={{ width: "12%" }} /> {/* BLINDS */}
  <col style={{ width: "15%" }} /> {/* CUT */}
  <col style={{ width: "15%" }} /> {/* ASSE */}
  <col style={{ width: "15%" }} /> {/* QC */}
  <col style={{ width: "15%" }} /> {/* INST */}
</colgroup>

// showByUnit = true (8 columns)
<colgroup>
  <col style={{ width: "8%" }} />
  <col style={{ width: "12%" }} />
  <col style={{ width: "16%" }} />
  <col style={{ width: "10%" }} />
  <col style={{ width: "14%" }} />
  <col style={{ width: "14%" }} />
  <col style={{ width: "12%" }} />
  <col style={{ width: "14%" }} />
</colgroup>
```

**C.** Header cells: shrink font on narrow viewports. Use `text-[10px] sm:text-[11px]`. Replace any `whitespace-nowrap` on numeric cells with `truncate`.

**D.** Percentage cells: render as compact pill `100%` on wide, `100` (no %) on `< 380px`. Or just use `tabular-nums` and `text-[11px]` — easier, then verify width.

**E.** **Sticky columns:** drop `position: sticky; left: X%` since the table no longer scrolls. Strip `floorStickyClass` and `unitStickyClass` references.

**F.** Test viewports — must fit without horizontal scroll on:
- iPhone SE (375px)
- iPhone 14 (390px)
- iPad mini (744px)
- 13" laptop (1280px)
- Both Chrome and Safari (this was the original Chrome-specific bug).

**Acceptance:** Every browser on every device shows all 7 (or 8 with show-by-unit) columns without horizontal scroll. No content cut off.

---

## Phase 3 — Label printing redesign + tracking

### T3.1 — Redesign printed PDF label (Avery 2315, 3"×2")

File: `src/components/manufacturing/cut-label-sheet.tsx`

Goal: prominence priority is **(1) Unit number → (2) Blind type ("fabric type") → (3) W × H → (4) Wand control side**. The window code (`item.label`, e.g. "W1") and room name move to secondary.

Replace the entire `LabelContent` JSX (lines 66-194) with this structure (keep imports/types):

```tsx
return (
  <div style={{
    fontFamily: "'Arial','Helvetica',sans-serif",
    color: "#000",
    width: "3in",
    height: "2in",
    padding: "0.1in",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: "0.04in",
    overflow: "hidden",
  }}>
    {/* Row 1: HUGE unit number + kind badge */}
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.08in" }}>
      <span style={{ fontSize: "20pt", fontWeight: 900, lineHeight: 1, letterSpacing: "-0.01em" }}>
        UNIT {item.unitNumber}
      </span>
      <span style={{
        flexShrink: 0,
        fontSize: "6.5pt",
        fontWeight: 800,
        letterSpacing: "0.06em",
        padding: "0.045in 0.06in",
        borderRadius: "999px",
        background: kindBadge.background,
        color: kindBadge.color,
      }}>{kindBadge.text}</span>
    </div>

    {/* Row 2: blind type (= fabric type) — large bold */}
    <span style={{ fontSize: "11pt", fontWeight: 800, lineHeight: 1, textTransform: "uppercase", letterSpacing: "0.02em" }}>
      {item.blindType}
    </span>

    {/* Row 3: W × H + wand side — large */}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.08in" }}>
      <span style={{ fontSize: "16pt", fontWeight: 900, lineHeight: 1 }}>
        {item.width ?? "—"} × {item.height ?? "—"}{item.depth != null ? ` × ${item.depth}` : ""}
      </span>
      <span style={{
        fontSize: "11pt",
        fontWeight: 900,
        lineHeight: 1,
        padding: "0.04in 0.08in",
        border: "1.5pt solid #000",
        borderRadius: "0.06in",
        whiteSpace: "nowrap",
      }}>
        {item.chainSide === "left" ? "WAND L" : item.chainSide === "right" ? "WAND R" : "WAND ?"}
      </span>
    </div>

    <div style={{ borderTop: "0.75pt solid #000" }} />

    {/* Row 4: secondary identity — building, window code, room */}
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "7pt", lineHeight: 1, color: "#333" }}>
      <span>{item.buildingName} · {item.label} · {item.roomName}</span>
      {installDate && <span>Install {installDate}</span>}
    </div>

    {/* Manufacturing summary block — keep existing rows but at smaller font */}
    {s.hasMeasurements && (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.025in", fontSize: "5.5pt", lineHeight: 1.2, color: "#222" }}>
        {/* Reuse existing summaryPairs rows but in 2-col grid; KEEP machine, post-cut, valance, tube, fabric adj, installation, chain side */}
      </div>
    )}

    {/* page number footer rendered at sheet level — see T3.2 */}
  </div>
);
```

Notes:
- The `item.chainSide` field is `"left" | "right" | null`. `VERIFY` exact field name in `ManufacturingWindowItem`.
- `item.blindType` is the source of truth for "fabric type" per user direction.
- Keep the manufacturing summary spec rows (machine, post-cut, valance, tube, etc.) intact but smaller — they're useful to the cutter, just no longer the headline.

**Acceptance:** print a sample PDF. From across a workshop, the unit number is the first thing legible; blind type and W×H are next; wand side is unmistakable as a boxed L/R indicator.

---

### T3.2 — Page numbers on every printed sheet

File: `src/app/cutter/queue/print/label-pdf-client.tsx:42-55`

After each `doc.addImage(...)`, **before** the next `addPage`, stamp the page number:

```tsx
for (let i = 0; i < sheets.length; i++) {
  const canvas = await html2canvas(sheets[i], { scale: 3, useCORS: true, backgroundColor: "#ffffff", logging: false });
  if (i > 0) doc.addPage([4, 6]);
  doc.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 4, 6);

  // Page number, hard-coded bottom-right
  const pageNum = `${i + 1} / ${sheets.length}`;
  doc.setFontSize(7);
  doc.setTextColor(60, 60, 60);
  doc.text(pageNum, 4 - 0.08, 6 - 0.08, { align: "right" });
}
```

(Coordinates are inches; sheet is 4×6, so we offset 0.08" from bottom-right.)

Apply the **same change** to the cut-list print at `src/app/cutter/queue/print-list/page.tsx` (or its client equivalent — `VERIFY`).

**Acceptance:** open a generated PDF; every page has "1 / 12", "2 / 12", … in the bottom-right corner.

---

### T3.3 — Track label printed; "skip already printed" option

**Step A — server action.** Create `src/app/actions/label-print-actions.ts`:

```ts
"use server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function markLabelsPrinted(input: {
  windowIds: string[];
  kind: "manufacturing" | "packaging";
}) {
  const supabase = await createSupabaseServerClient();
  const column = input.kind === "manufacturing"
    ? "manufacturing_label_printed_at"
    : "packaging_label_printed_at";
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("window_production_status")
    .update({ [column]: now })
    .in("window_id", input.windowIds);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
```

(`VERIFY` server-action helper file pattern matches existing actions like `src/app/actions/manufacturer-actions.ts`.)

**Step B — call after PDF download succeeds.** In `src/app/cutter/queue/print/label-pdf-client.tsx:54-56`, after `doc.save(...)` succeeds:

```tsx
doc.save(`cut-labels-${today}.pdf`);
// Mark printed — fire and forget, but await before showing "done"
if (labelMode === "both") {
  await markLabelsPrinted({ windowIds: items.map((i) => i.windowId), kind: "manufacturing" });
  await markLabelsPrinted({ windowIds: items.map((i) => i.windowId), kind: "packaging" });
} else {
  await markLabelsPrinted({ windowIds: items.map((i) => i.windowId), kind: labelMode });
}
setStatus("done");
```

**Step C — "Skip already printed" checkbox in print dialog.** Find the cutter queue print modal in `src/components/manufacturing/manufacturing-role-queue.tsx:728-758` (Print labels button area). Add a checkbox to the dialog:

```tsx
<label className="flex items-center gap-2 text-sm">
  <input type="checkbox" checked={skipAlreadyPrinted} onChange={(e) => setSkipAlreadyPrinted(e.target.checked)} />
  Skip blinds whose {labelMode} label was already printed
</label>
```

Default checked: `true`. When user submits, append `&skipPrinted=1` to the `/cutter/queue/print?ids=...&labelMode=...` URL.

**Step D — server filter.** In `src/app/cutter/queue/print/page.tsx` and `loadWindowsForPrint` (`src/lib/manufacturing-print-data.ts` — `VERIFY`), add a `skipPrinted` boolean param. When true, exclude windows where the matching `*_label_printed_at` is non-null.

If the filtered list is empty, show: "All selected blinds already had their labels printed. Uncheck the option to print anyway."

**Step E — badges.**
- **Per-window badge:** In every place a window is rendered in the cutter queue and unit-detail UI (`cutter-unit-detail.tsx:22-110`, `manufacturing-role-queue.tsx:940-970`), if `manufacturing_label_printed_at != null` show a small `MFG ✓` pill; same for `PKG ✓`.
- **Per-unit aggregate badge:** In unit list rows (cutter portal), show a `MFG labels printed` badge only when **every** window in the unit has `manufacturing_label_printed_at != null`. Same for packaging.

**Acceptance:**
1. Print manufacturing labels for windows W1, W2 → DB shows timestamps for those rows in the manufacturing column. Reload queue → both windows show `MFG ✓` pill. Unit-level badge appears only after every window in unit is stamped.
2. Open print dialog again, "Skip already printed" checked → submit; PDF is empty / "All printed" message; no duplicate stamps.
3. Uncheck and submit → PDF generates anyway, timestamps update.

---

## Phase 4 — Manufacturing queue sort

### T4.1 — Default global ordering: install_date → building → floor → unit

File: `src/components/manufacturing/manufacturing-role-queue.tsx` — the `normalizeSchedule` and main render path around lines 240-310, 590-610.

**Required ordering (always applied first, never overridden):**
1. Primary key for **day bucket**: `installation_date ?? complete_by_date ?? null` (null sinks to end).
2. Within the same bucket: `building_name ASC`, then `floor ASC`, then `unit_number ASC`, then existing `getWindowPriority` (rework/issues float to top of bucket).

User custom sort levels (from the existing Sort modal) **only sort within the same day bucket** — they cannot reshuffle across days. Implement by:

```ts
// Pseudocode for the merged sort
const grouped = groupBy(items, (i) => i.installationDate ?? i.completeByDate ?? "9999-99-99");
const sortedDays = Object.keys(grouped).sort(); // ascending date order
const result: Item[] = [];
for (const day of sortedDays) {
  let dayItems = grouped[day];
  // 1. Apply intra-day default secondary sort: building → floor → unit, with priority floats
  dayItems = applyIntraDayDefault(dayItems);
  // 2. If user has custom sort levels, apply ONLY within this day's items
  if (sortLevels.length > 0) dayItems = multiLevelSort(dayItems, sortLevels, role);
  result.push(...dayItems);
}
return result;
```

The "issues/returns/rework float to top" rule still applies, but **within a day bucket only**.

**Acceptance:** open cutter queue with units across multiple install dates. Earliest date appears first. Within the same date, units cluster by building, then floor, then unit. Apply a custom sort (e.g. fabric width DESC) — order within each day reshuffles, dates remain in install-date order.

---

### T4.2 — EZ Sort button (cutter queue)

Same file. Add a third button next to existing "Sort" and "Filter":

```tsx
<EzSortButton
  current={ezSort}
  onChange={(preset) => {
    setEzSort(preset);
    if (preset === "list_packaging") {
      setSortLevels([
        { field: "building", direction: "asc" },
        { field: "unit", direction: "asc" },
        { field: "label", direction: "asc" }, // "blind name" = window label code (W1, W2…)
      ]);
    } else if (preset === "manufacturing") {
      setSortLevels([
        { field: "blindType", direction: "asc" },
        { field: "windowWidth", direction: "desc" }, // widest → narrowest
      ]);
    } else {
      setSortLevels([]);
    }
  }}
/>
```

Button label is literally `EZ Sort` (capital EZ). Clicking opens a 2-option chooser:
1. **List + Packaging Labels** → sorts by building → unit → blind name (= `windows.label`)
2. **Manufacturing Labels** → sorts by blind type → window width DESC

Both presets are **applied as user sort levels**, so per T4.1 they sort within the day bucket only — preserving the install-date primary order.

`VERIFY` the field names (`building`, `unit`, `label`, `blindType`, `windowWidth`) match the existing `SortField` enum at line ~97. Add any missing ones.

**Acceptance:**
- "List + Packaging Labels" preset: within each day, units group by building, then by unit number, then windows by their label (W1, W2…).
- "Manufacturing Labels" preset: within each day, all the same blind type clusters together, widest window first.
- Clear preset → returns to default intra-day order.

---

## Phase 5 — Process stages on dashboards

### T5.1 — Replace "Manufactured" with "Cut / Assembled / QC" + add Post-Install Issue

Files (a sweep — `VERIFY` each one):

1. **Owner status grid report** `src/app/management/reports/status-grid-report.tsx:22-36` and 68. Update the 4-letter status union → 7-state union using `PROGRESS_STAGE_LETTERS` from T0.2. Cells: derive a unit-level rollup state (the **furthest stage all windows have reached**) and display its letter. Add color for each new state (suggest: cutting=yellow, assembling=orange, qc=blue, post_install_issue=red).

2. **Owner unit detail "Progress" panel** `src/app/management/units/[id]/management-unit-detail.tsx:465` — the `<UnitProgressMilestonesPanel>`. Replace the 4-step display with 6 steps + optional 7th. Use `deriveWindowStages` (T0.2) per window, then aggregate.

3. **Scheduler unit detail** `src/app/scheduler/units/[id]/scheduler-unit-detail.tsx:188-200` — same expansion.

4. **Installer dashboard** — find the equivalent stage display (`grep -rn "manufactured" src/app/installer/`) and expand.

5. **Owner dashboard** `src/app/management/management-dashboard.tsx` — same.

6. **Window-level milestone display** in `src/components/units/unit-progress-milestones-panel.tsx` and any other shared milestone component — `VERIFY`.

7. The `PROGRESS_DEPTH` map in `src/lib/types.ts:21-26` is for the legacy stages. **Don't delete** — leave for backward compatibility; new code uses `deriveWindowStages` instead.

**Acceptance:**
- Status grid shows a unit cell with `M`, `B`, `C`, `A`, `Q`, `I`, or `PI` based on furthest aggregate stage.
- Unit detail progress panel renders 6 milestones in this order: Measurement, Bracketing, Cut, Assembled, QC, Installed; with an optional 7th "Post-Install Issue" panel that only appears when a window has an open issue.
- Measurement and bracketing render as parallel — neither depends on the other.

---

### T5.2 — Manufacturing process screen columns (no scope change here)

T2.1 already fixed horizontal scroll. The current 4 stage columns (CUT / ASSE / QC / INST) match the new taxonomy and stay as-is. **Don't add MEASURE / BRACKET columns** — that's outside the requested scope. Note in PR: "manufacturing process columns intentionally stay at CUT/ASSE/QC/INST since this screen is the production view."

---

## Phase 6 — Post-install issue flow

### T6.1 — Server actions for post-install issues

Create `src/app/actions/post-install-issue-actions.ts`:

```ts
"use server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/auth"; // VERIFY helper name
import { randomUUID } from "crypto";

export async function openPostInstallIssue(input: {
  windowId: string;
  unitId: string;
  body: string;
}) {
  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Not authenticated" };
  if (user.role !== "owner" && user.role !== "scheduler") {
    return { ok: false as const, error: "Only owners and schedulers can flag issues" };
  }

  const issueId = randomUUID();
  const { error: e1 } = await supabase.from("window_post_install_issues").insert({
    id: issueId,
    window_id: input.windowId,
    unit_id: input.unitId,
    opened_by_user_id: user.id,
    opened_by_role: user.role,
    status: "open",
  });
  if (e1) return { ok: false as const, error: e1.message };

  if (input.body.trim()) {
    const { error: e2 } = await supabase.from("window_post_install_issue_notes").insert({
      id: randomUUID(),
      issue_id: issueId,
      author_user_id: user.id,
      author_role: user.role,
      body: input.body.trim(),
    });
    if (e2) return { ok: false as const, error: e2.message };
  }

  return { ok: true as const, issueId };
}

export async function addPostInstallIssueNote(input: { issueId: string; body: string }) { /* similar pattern */ }

export async function resolvePostInstallIssue(input: { issueId: string; closingNote?: string }) {
  // sets status='resolved', resolved_at=now(), resolved_by_user_id=user.id
  // optional closing note inserted into notes table
}
```

`VERIFY` the auth helper. If `getCurrentUser` doesn't exist, look at how existing actions in `src/app/actions/manufacturer-actions.ts` read the current user.

---

### T6.2 — UI: flag issue button on installed window

Add a "Flag post-install issue" button on each installed window row in:
- Owner unit detail
- Scheduler unit detail

Hide the button for any other role. Clicking opens a modal:

```
[Flag Post-Install Issue]
Window: W1 · Living Room · Unit 1207
Note (required):
[textarea]
[Cancel] [Open issue]
```

(Photos: per user direction, history is critical. For now allow note only; photo attachment ties into existing `media_uploads` flow — `VERIFY` and add a follow-up if photos need wiring.)

When an issue exists on a window:
- Show a red "Post-install issue" pill on the window row
- Owner/scheduler view shows the issue thread (notes timeline) inline
- "Add note" and "Resolve" buttons available

When resolved: window's `installed` state is unchanged (per user direction); the issue moves to history (status=resolved). The pill goes away once all issues on that window are resolved.

Note: per user, this **does not affect manufacturing queue** — no auto re-cut. Just history.

---

### T6.3 — Aggregate "PI" stage everywhere

A unit shows the "Post-Install Issue" stage marker (PI letter, red color) when **any** window has an open issue. Source: `deriveWindowStages` (T0.2) reads `hasOpenPostInstallIssue` per window, fed by a left-join of `window_post_install_issues` filtered to `status='open'`.

**Acceptance:**
1. Owner flags issue on window W1 of installed unit 1207. Unit shows "PI" in status grid (red). Window shows red pill + thread.
2. Owner adds another note. Thread updates with both notes timestamped.
3. Owner resolves issue. Pill disappears, unit goes back to showing "I". History tab still shows the resolved issue with full thread.
4. Installer & cutter views show the "PI" indicator (read-only). They cannot flag or resolve.

---

## Phase 7 — Daily snapshot job + Progress Report

### T7.1 — Daily snapshot writer (server-side cron)

This is the **load-bearing** piece for "going back" to historical days.

**Decide cron mechanism.** `VERIFY` what's currently used — either:
- Vercel Cron (`vercel.json`)
- A Supabase scheduled function
- A cron-like serverless route hit by an external pinger

If none exists, add Vercel Cron (simplest). Create `src/app/api/cron/daily-snapshot/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { snapshotProgressForDate } from "@/lib/progress-snapshot";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  // Snapshot for "today" in America/Toronto
  const today = todayInToronto(); // YYYY-MM-DD
  const result = await snapshotProgressForDate(today);
  return NextResponse.json({ ok: true, ...result });
}
```

Add to `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/daily-snapshot", "schedule": "5 4 * * *" }
  ]
}
```
(00:05 America/Toronto = 04:05 or 05:05 UTC depending on DST. `VERIFY` and pick a fixed UTC time that's always after midnight Toronto.)

**Snapshot logic** (`src/lib/progress-snapshot.ts`):

For each stage, capture rows for every unit "in the queue for that day":

| Stage | "Units in queue for day D" definition | Expected blinds | Done blinds | Assigned |
|---|---|---|---|---|
| `measurement` | `units.measurement_date = D` | `unit.window_count` (or 0 if measurement not yet done — per user direction) | windows where `measured = true` AND `measured_at <= end of D` | `assigned_installer.name` |
| `bracketing` | `units.bracketing_date = D` | `unit.window_count` (or 0 if neither bracketed nor measured) | windows where `bracketed = true` AND `bracketed_at <= end of D` | `assigned_installer.name` |
| `cutting` | unit has any window in queue with `target_ready_date = D` | count of windows with `target_ready_date = D` | windows where `cut_at <= end of D` | distinct `cut_by_cutter_id`s of done windows; "—" if 0 done |
| `assembling` | windows with `target_ready_date = D` AND `cut_at IS NOT NULL` | count of those | windows where `assembled_at <= end of D` | distinct assemblers of done windows |
| `qc` | windows with `target_ready_date = D` AND `assembled_at IS NOT NULL` | count of those | windows where `qc_approved_at <= end of D` | distinct QC users of done windows |
| `installation` | `units.installation_date = D` | `unit.window_count` | windows where `installed = true` AND `installed_at <= end of D` | `assigned_installer.name` |
| `post_install_issue` | issues opened on day D | count of issues opened | count resolved by end of D | opener |

**Idempotency:** insert with `ON CONFLICT (snapshot_date, stage, unit_id) DO UPDATE` so re-running for the same day overwrites (useful for backfill).

**Backfill:** add a one-shot script `scripts/backfill-snapshots.ts` that iterates dates from a chosen start (e.g. 2026-04-01) to today and calls `snapshotProgressForDate` for each.

**Acceptance:**
1. Trigger the cron route manually with the Bearer header → rows appear in `daily_progress_snapshots` for today.
2. Run again → row count unchanged (idempotent).
3. Backfill 7 days → 7× the expected rows.

---

### T7.2 — Progress Report page (owner)

New menu item under owner reports.

**Route:** `src/app/management/reports/progress/page.tsx` (server component) and `progress-report.tsx` (client).

**Add nav entry:** in `src/app/management/reports/page.tsx` or wherever reports are listed, add a tab/link "Progress Report" alongside the existing status grid.

**UI layout:**

```
┌─────────────────────────────────────────────────────────────┐
│ Progress Report                              [Refresh]      │
│ ─────────────────────────────────────────────────────────── │
│ Process: ( ) Measurement (•) Bracketing ( ) Cutting         │
│          ( ) Assembling ( ) QC ( ) Installation             │
│          ( ) Post-Install Issue                             │
│                                                             │
│ Date range: [Apr 27 ▼] to [Apr 29 ▼]                        │
│                                                             │
│ Filters (multi-select):                                     │
│  Client: [▼] · Building: [▼] · Installer: [▼]               │
│  Scheduler: [▼] · Cutter: [▼] · Assembler: [▼] · QC: [▼]    │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│ Date       Floor  Unit    Assigned       Blinds   %         │
│ ─────────  ─────  ──────  ─────────────  ───────  ────      │
│ Apr 27     2      211     A. Milrud      0 / 5    0%        │
│ Apr 27     4      403     A. Milrud      4 / 4    100%      │
│ Apr 28     5      510     J. Smith       3 / 5    60%       │
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

Process: **single-select** (radio group). Date range: max 90 days. Filters: each multi-select dropdown.

**Data source:** `daily_progress_snapshots`. Query:
```sql
SELECT * FROM daily_progress_snapshots
WHERE stage = $1 AND snapshot_date BETWEEN $2 AND $3
  AND ($4::text[] IS NULL OR client_id = ANY($4))
  AND ($5::text[] IS NULL OR building_id = ANY($5))
  -- assigned_user_ids JSONB ?| any($6) for installer/cutter/etc filters
ORDER BY snapshot_date, building_name, floor, unit_number;
```

**Filters by role** map to which `assigned_user_ids` to match:
- Installer filter applies to measurement / bracketing / installation rows
- Cutter filter applies to cutting rows
- Assembler filter applies to assembling rows
- QC filter applies to qc rows
- Scheduler filter — `VERIFY` what scheduler "owns" given they don't appear in the table directly; possibly filter by which scheduler created the unit

**Columns rendered:** Date, Floor, Unit, Assigned, Blinds (`done_blinds / expected_blinds`), %.

For 0 expected (e.g. measurement not yet done): show `0 / 0` and `0%`.

**Acceptance:**
1. Pick "Cutting", date range "Apr 27–Apr 29". Table shows one row per (date × unit) with windows that had `target_ready_date` in that range, who actually cut them, expected vs done counts.
2. Pick "Measurement", same date range. Units with `measurement_date` in range appear; if no measurement done, row reads `0 / 0 — 0%`.
3. Pick "Post-Install Issue". Rows show issues opened in range with the opener as "Assigned".
4. Add a Building filter → table narrows to only that building.
5. Open the page on a date *after* a snapshot was captured — historical rows still display unchanged (key requirement: "going back").

---

## Phase 8 — Final integration testing checklist

For the executing model, after all tasks:

- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] Run dev server, manually walk through:
  - [ ] Owner: dashboard, unit detail (title visible), reports → Progress Report (each process type), accounts (Add buttons), buildings → +Units (no inline form)
  - [ ] Scheduler: same plus flagging a post-install issue
  - [ ] Installer: dashboard, unit detail; cannot flag issues; sees PI marker on flagged units
  - [ ] Cutter: queue (default sort = install date → bldg → floor → unit), EZ Sort presets work, print labels with Skip-already-printed checkbox, badges appear after printing, page numbers on PDFs
  - [ ] Assembler / QC: queues sorted same as cutter
- [ ] Print 3-page label PDF → page numbers in bottom-right of each page
- [ ] Print same labels twice with skip checked → second run is empty
- [ ] Manufacturing process screen has zero horizontal scroll on Chrome 375px / 390px / 744px / 1280px AND on Safari same widths
- [ ] Refresh button on every page header
- [ ] Trigger daily snapshot cron route manually → snapshot rows appear
- [ ] Status grid report shows new letters (M/B/C/A/Q/I/PI)
- [ ] `grep -rn "manufactured" src/app/` returns empty
- [ ] `grep -rn "Invite" src/app/management/accounts/` returns only component names

---

## Open / Out-of-scope (parking lot)

- **Photos on post-install issues** — flagged in T6.2 as note-only for now. Wire photo upload as a follow-up by reusing `media_uploads`.
- **Re-queue logic for post-install issues** — explicitly deferred per user ("we'll need to figure that one out later").
- **Owners/scheduler permission boundary** — confirm that owner role and scheduler role are the only ones with the issue-flag button (T6.1 enforces server-side; UI just hides the button).
