import { snapshotProgressForDate, todayInToronto } from "../src/lib/progress-snapshot.ts";

function usage(): never {
  throw new Error(
    "Usage: node --experimental-strip-types scripts/backfill-snapshots.ts [--days 7 | --start YYYY-MM-DD --end YYYY-MM-DD]"
  );
}

function assertDateKey(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) usage();
  return value;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function parseArgs(argv: string[]) {
  let start: string | null = null;
  let end: string | null = null;
  let days: number | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--start" && next) {
      start = assertDateKey(next);
      i += 1;
    } else if (arg === "--end" && next) {
      end = assertDateKey(next);
      i += 1;
    } else if (arg === "--days" && next) {
      days = Number(next);
      if (!Number.isInteger(days) || days <= 0) usage();
      i += 1;
    } else {
      usage();
    }
  }

  if (days !== null) {
    const finalDate = todayInToronto();
    return {
      start: addDays(finalDate, -(days - 1)),
      end: finalDate,
    };
  }

  if (start && end) return { start, end };
  if (!start && !end) {
    const finalDate = todayInToronto();
    return { start: addDays(finalDate, -6), end: finalDate };
  }

  usage();
}

async function main() {
  const { start, end } = parseArgs(process.argv.slice(2));
  if (start > end) usage();

  let totalRows = 0;
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const result = await snapshotProgressForDate(date);
    totalRows += result.rows;
    console.log(`${date}: ${result.rows} rows`);
  }

  console.log(`Backfill complete: ${start} to ${end}, ${totalRows} rows upserted.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
