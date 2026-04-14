import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

const DEFAULT_WORKBOOK = path.resolve(
  process.cwd(),
  'data/reports/location-evaluation-2026-04-14-TO-merged.xlsx',
);
const NEW_COLUMN = 'alle_locatietermen_object';
const INSERT_AFTER = 'ef_review_opmerking';

type CliOptions = {
  workbookPath: string;
  dryRun: boolean;
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let workbookPath = DEFAULT_WORKBOOK;
  let dryRun = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--workbook') {
      workbookPath = path.resolve(process.cwd(), args[i + 1] || workbookPath);
      i += 1;
      continue;
    }

    if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  return { workbookPath, dryRun };
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function makeLockPath(workbookPath: string): string {
  return path.join(
    path.dirname(workbookPath),
    `~$${path.basename(workbookPath)}`,
  );
}

function autosizeColumns(sheet: XLSX.WorkSheet, rows: Array<Record<string, unknown>>) {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  sheet['!cols'] = headers.map((header) => {
    const maxValueLength = rows.reduce((max, row) => {
      const value = row[header];
      const text = value === null || value === undefined ? '' : String(value);
      return Math.max(max, text.length);
    }, header.length);

    return {
      wch: Math.min(Math.max(maxValueLength + 2, 10), header === NEW_COLUMN ? 72 : 48),
    };
  });
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 } as never;
  if (sheet['!ref']) {
    sheet['!autofilter'] = { ref: sheet['!ref'] };
  }
}

function buildTermContext(rows: Array<Record<string, unknown>>): Map<string, string> {
  const byObject = new Map<string, string[]>();

  for (const row of rows) {
    const recordnummer = toText(row.recordnummer);
    const objectnummer = toText(row.objectnummer);
    if (!recordnummer || !objectnummer) continue;

    const key = `${recordnummer}::${objectnummer}`;
    const term =
      toText(row.rijksmuseum_geografisch_trefwoord_atomair) ||
      toText(row.geografisch_trefwoord);
    if (!term) continue;

    const existing = byObject.get(key) || [];
    if (!existing.includes(term)) {
      existing.push(term);
      byObject.set(key, existing);
    }
  }

  return new Map(
    Array.from(byObject.entries()).map(([key, terms]) => [key, terms.join(' | ')]),
  );
}

function buildRowsWithContext(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const termContext = buildTermContext(rows);

  return rows.map((row) => {
    const recordnummer = toText(row.recordnummer);
    const objectnummer = toText(row.objectnummer);
    const key = `${recordnummer}::${objectnummer}`;
    const contextValue = termContext.get(key) || '';

    const orderedEntries = Object.entries(row).filter(([column]) => column !== NEW_COLUMN);
    const nextRow: Record<string, unknown> = {};
    let inserted = false;

    for (const [column, value] of orderedEntries) {
      nextRow[column] = value;
      if (column === INSERT_AFTER) {
        nextRow[NEW_COLUMN] = contextValue;
        inserted = true;
      }
    }

    if (!inserted) {
      nextRow[NEW_COLUMN] = contextValue;
    }

    return nextRow;
  });
}

function preserveTitleLinks(sourceSheet: XLSX.WorkSheet, targetSheet: XLSX.WorkSheet) {
  if (!sourceSheet['!ref'] || !targetSheet['!ref']) return;

  const sourceRange = XLSX.utils.decode_range(sourceSheet['!ref']);
  for (let row = 1; row <= sourceRange.e.r; row += 1) {
    const cellRef = XLSX.utils.encode_cell({ r: row, c: 0 });
    const sourceCell = sourceSheet[cellRef];
    const targetCell = targetSheet[cellRef];
    if (sourceCell?.l && targetCell) {
      targetCell.l = sourceCell.l;
    }
  }
}

function main() {
  const { workbookPath, dryRun } = parseArgs();
  const lockPath = makeLockPath(workbookPath);

  if (!dryRun && fs.existsSync(lockPath)) {
    throw new Error(`Workbook is open in Excel. Close it first: ${lockPath}`);
  }

  const workbook = XLSX.readFile(workbookPath);
  const sheet = workbook.Sheets.Evaluatie;
  if (!sheet) {
    throw new Error('Sheet "Evaluatie" not found.');
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (rows.length === 0) {
    throw new Error('No rows found in sheet "Evaluatie".');
  }

  const rowsWithContext = buildRowsWithContext(rows);
  const nextSheet = XLSX.utils.json_to_sheet(rowsWithContext);
  autosizeColumns(nextSheet, rowsWithContext);
  preserveTitleLinks(sheet, nextSheet);
  workbook.Sheets.Evaluatie = nextSheet;

  if (!dryRun) {
    XLSX.writeFile(workbook, workbookPath);
  }

  console.log(`${dryRun ? 'Dry-run' : 'Updated'} ${rowsWithContext.length} rows in ${workbookPath}`);
  console.log(`Added/updated column: ${NEW_COLUMN}`);
}

main();
