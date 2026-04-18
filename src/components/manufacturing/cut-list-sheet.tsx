import type { ManufacturingWindowItem } from "@/lib/manufacturing-scheduler";
import { toCutListRow } from "@/lib/cut-list-row";

interface CutListSheetProps {
  items: ManufacturingWindowItem[];
}

interface ColDef {
  label: string;
  w: number; // mm, for print fidelity
  wrap?: boolean;
}

// Total mm = 268mm. A4 landscape usable @ 5mm margins = 287mm. Well within.
const HEADERS: ColDef[] = [
  { label: "Date",        w: 17 },
  { label: "Building",    w: 24, wrap: true },
  { label: "Fl.",         w: 6 },
  { label: "Unit",        w: 10 },
  { label: "Returned",    w: 20, wrap: true },
  { label: "Install",     w: 13 },
  { label: "Room",        w: 16, wrap: true },
  { label: "Win.",        w: 8 },
  { label: "Type",        w: 14 },
  { label: "W × H",       w: 22 },
  { label: "Fab adj.",    w: 14 },
  { label: "Fab (mach.)", w: 15 },
  { label: "Fab (cut)",   w: 14 },
  { label: "Valance",     w: 13 },
  { label: "Tube",        w: 13 },
  { label: "Bot. rail",   w: 13 },
  { label: "Wand",        w: 11 },
  { label: "Install.",    w: 12 },
  { label: "Chain",       w: 13 },
];

export function CutListSheet({ items }: CutListSheetProps) {
  const totalMm = HEADERS.reduce((s, h) => s + h.w, 0);

  return (
    <table
      style={{
        borderCollapse: "collapse",
        fontSize: "7pt",
        fontFamily: "Arial, Helvetica, sans-serif",
        width: `${totalMm}mm`,
        tableLayout: "fixed",
      }}
    >
      <colgroup>
        {HEADERS.map((h, i) => (
          <col key={i} style={{ width: `${h.w}mm` }} />
        ))}
      </colgroup>
      <thead>
        <tr style={{ background: "#1a1a1a", color: "#fff" }}>
          {HEADERS.map((h) => (
            <th
              key={h.label}
              style={{
                padding: "3px 4px",
                textAlign: "left",
                fontWeight: 700,
                fontSize: "6.5pt",
                whiteSpace: "nowrap",
                borderRight: "1px solid #444",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {h.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((item, idx) => {
          const row = toCutListRow(item);
          const { isReturned } = row;

          const bg = idx % 2 === 0 ? "#fff" : "#f7f7f7";
          const rowBg = isReturned ? "#fff5f5" : bg;

          const cells: { value: string; red?: boolean; bold?: boolean }[] = [
            { value: row.date },
            { value: row.building },
            { value: row.floor },
            { value: row.unit },
            { value: row.returned, red: isReturned, bold: isReturned },
            { value: row.install },
            { value: row.room },
            { value: row.win },
            { value: row.type },
            { value: row.dimensions },
            { value: row.fabAdj },
            { value: row.fabMach },
            { value: row.fabCut },
            { value: row.valance },
            { value: row.tube },
            { value: row.botRail },
            { value: row.wand },
            { value: row.installation },
            { value: row.chain },
          ];

          return (
            <tr key={item.windowId} style={{ background: rowBg }}>
              {cells.map((cell, ci) => {
                const col = HEADERS[ci];
                return (
                  <td
                    key={ci}
                    style={{
                      padding: "3px 4px",
                      borderBottom: "1px solid #e5e7eb",
                      borderRight: "1px solid #e5e7eb",
                      verticalAlign: "top",
                      lineHeight: "1.25",
                      whiteSpace: col.wrap ? "normal" : "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      color: cell.red ? "#dc2626" : "#111",
                      fontWeight: cell.bold ? 600 : 400,
                    }}
                    title={cell.value}
                  >
                    {cell.value}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
