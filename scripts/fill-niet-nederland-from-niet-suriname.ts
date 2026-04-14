import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

const DEFAULT_WORKBOOK = path.resolve(
  process.cwd(),
  'data/reports/location-evaluation-2026-04-14-TO-merged.xlsx',
);

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
      continue;
    }
  }

  return { workbookPath, dryRun };
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function makeLockPath(workbookPath: string): string {
  return path.join(path.dirname(workbookPath), `~$${path.basename(workbookPath)}`);
}

function main() {
  const { workbookPath, dryRun } = parseArgs();

  if (!dryRun) {
    const lockPath = makeLockPath(workbookPath);
    if (fs.existsSync(lockPath)) {
      throw new Error(`Workbook is open in Excel. Close it first: ${lockPath}`);
    }
  }

  const workbook = XLSX.readFile(workbookPath);
  const sheet = workbook.Sheets.Evaluatie;
  if (!sheet) {
    throw new Error('Sheet "Evaluatie" not found.');
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const byObject = new Map<string, number[]>();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const objectnummer = text(row.objectnummer);
    if (!objectnummer) continue;
    const indices = byObject.get(objectnummer) || [];
    indices.push(i);
    byObject.set(objectnummer, indices);
  }

  const targetObjects = new Set<string>();
  for (const [objectnummer, indices] of byObject.entries()) {
    if (indices.length <= 1) continue;

    const hasNietSuriname = indices.some((idx) => {
      const remark = text(rows[idx].ef_review_opmerking).toLowerCase();
      return remark.includes('niet-suriname');
    });

    if (hasNietSuriname) {
      targetObjects.add(objectnummer);
    }
  }

  let updatedRows = 0;
  let touchedObjects = 0;
  const touchedObjectSet = new Set<string>();

  for (const objectnummer of targetObjects) {
    const indices = byObject.get(objectnummer) || [];
    for (const idx of indices) {
      const row = rows[idx];
      const reviewLoc = text(row.ef_review_locatie);
      if (reviewLoc) continue;

      row.ef_review_locatie = 'niet-nederland';
      updatedRows += 1;
      touchedObjectSet.add(objectnummer);
    }
  }

  touchedObjects = touchedObjectSet.size;

  if (!dryRun) {
    const nextSheet = XLSX.utils.json_to_sheet(rows);
    nextSheet['!ref'] = sheet['!ref'];
    nextSheet['!cols'] = sheet['!cols'];
    nextSheet['!freeze'] = sheet['!freeze'];
    nextSheet['!autofilter'] = sheet['!autofilter'];

    if (sheet['!ref']) {
      const range = XLSX.utils.decode_range(sheet['!ref']);
      for (let r = 1; r <= range.e.r; r += 1) {
        const ref = XLSX.utils.encode_cell({ r, c: 0 });
        if (sheet[ref]?.l && nextSheet[ref]) {
          nextSheet[ref].l = sheet[ref].l;
        }
      }
    }

    workbook.Sheets.Evaluatie = nextSheet;
    XLSX.writeFile(workbook, workbookPath);
  }

  console.log(
    JSON.stringify(
      {
        workbookPath,
        dryRun,
        totalRows: rows.length,
        objectGroups: byObject.size,
        targetObjects: targetObjects.size,
        touchedObjects,
        updatedRows,
      },
      null,
      2,
    ),
  );
}

main();
