import fs from 'fs';
import Papa from 'papaparse';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const STREET_CSV_PATH = path.join(DATA_DIR, 'straten_paramaribo20260206.csv');
const OUTPUT_PATH = path.join(DATA_DIR, 'paramaribo-street-aliases.json');
const STREET_INSTANCE_QID = 'Q79007';

type StreetRow = {
  p31?: string;
  Label?: string;
  alias1?: string;
  alias2?: string;
  alias3?: string;
  alias4?: string;
  alias5?: string;
  wikidataID?: string;
};

type StreetAliasEntry = {
  label: string;
  aliases: string[];
  wikidataQid: string | null;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeQid(value: string | undefined): string | null {
  const trimmed = (value || '').trim().toUpperCase();
  return /^Q\d+$/.test(trimmed) ? trimmed : null;
}

function collectUniqueAliases(row: StreetRow): string[] {
  const seen = new Set<string>();
  const values = [row.alias1, row.alias2, row.alias3, row.alias4, row.alias5];

  for (const value of values) {
    const trimmed = normalizeWhitespace(value || '');
    if (!trimmed) continue;
    seen.add(trimmed);
  }

  return Array.from(seen);
}

function loadStreetRows(): StreetRow[] {
  if (!fs.existsSync(STREET_CSV_PATH)) {
    throw new Error(`Street CSV not found: ${STREET_CSV_PATH}`);
  }

  const csv = fs.readFileSync(STREET_CSV_PATH, 'utf-8');
  const parsed = Papa.parse<StreetRow>(csv, {
    header: true,
    delimiter: ';',
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new Error(`CSV parse error on row ${first.row}: ${first.message}`);
  }

  return parsed.data;
}

function buildEntries(rows: StreetRow[]): StreetAliasEntry[] {
  const entries: StreetAliasEntry[] = [];

  for (const row of rows) {
    if (normalizeWhitespace(row.p31 || '') !== STREET_INSTANCE_QID) continue;

    const label = normalizeWhitespace(row.Label || '');
    if (!label) continue;

    const aliases = collectUniqueAliases(row).filter((alias) => alias !== label);

    entries.push({
      label,
      aliases,
      wikidataQid: normalizeQid(row.wikidataID),
    });
  }

  entries.sort((a, b) => a.label.localeCompare(b.label, 'nl'));

  return entries;
}

function main() {
  const rows = loadStreetRows();
  const entries = buildEntries(rows);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(entries, null, 2) + '\n', 'utf-8');

  const aliasCount = entries.reduce((count, entry) => count + entry.aliases.length, 0);

  console.log(`Wrote ${entries.length} street alias entries to ${OUTPUT_PATH}`);
  console.log(`Collected ${aliasCount} alias variants`);
}

main();