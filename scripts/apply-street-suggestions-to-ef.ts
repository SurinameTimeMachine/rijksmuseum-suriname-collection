import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

type CliOptions = {
  workbookPath: string;
  dryRun: boolean;
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);

  let workbookPath = path.resolve(
    process.cwd(),
    'data/reports/location-evaluation-2026-04-14-TO-merged.xlsx',
  );
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

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function main() {
  const { workbookPath, dryRun } = parseArgs();

  // Refuse to write if Excel has the file open (lock file present)
  const lockPath = path.join(
    path.dirname(workbookPath),
    `~$${path.basename(workbookPath)}`,
  );
  if (!dryRun && fs.existsSync(lockPath)) {
    console.error(
      `ERROR: Het EF-bestand is momenteel open in Excel (lockfile aanwezig: ${lockPath}).\n` +
      `Sluit het bestand eerst, of gebruik --dry-run voor een preview.`,
    );
    process.exit(1);
  }

  const workbook = XLSX.readFile(workbookPath);
  const sheet = workbook.Sheets.Evaluatie;
  if (!sheet) {
    throw new Error('Sheet "Evaluatie" not found.');
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });

  const ref = sheet['!ref'];
  if (!ref) {
    throw new Error('Worksheet has no !ref range.');
  }

  const range = XLSX.utils.decode_range(ref);
  const headers: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c });
    headers[c] = toText(sheet[cellRef]?.v);
  }

  const bestCol = headers.findIndex((h) => h === 'beste_locatiesuggestie');
  if (bestCol < 0) {
    throw new Error('Column "beste_locatiesuggestie" not found.');
  }

  let updated = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const reviewLoc = toText(row.ef_review_locatie);
    const reviewRemark = toText(row.ef_review_opmerking);

    // Only untouched rows: preserve all existing reviewer work.
    const untouched = !reviewLoc && !reviewRemark;
    if (!untouched) continue;

    const streetLabel = toText(row.straat_suggestie_top_label);
    if (!streetLabel) continue;

    const streetQid = toText(row.straat_suggestie_top_qid);
    const streetScore = toText(row.straat_suggestie_top_score);

    const bestValue = [
      streetLabel,
      streetQid,
      streetScore ? `score ${streetScore}` : '',
      '[street-suggestion]',
    ]
      .filter(Boolean)
      .join(' | ');

    const excelRow = i + 1; // +1 because header is row 0
    const bestCellRef = XLSX.utils.encode_cell({ r: excelRow, c: bestCol });

    if (!dryRun) {
      sheet[bestCellRef] = { t: 's', v: bestValue };
    }

    updated += 1;
  }

  if (!dryRun) {
    XLSX.writeFile(workbook, workbookPath);
  }

  console.log(
    `${dryRun ? 'Dry-run' : 'Updated'} ${updated} rows in ${workbookPath}`,
  );
}

main();
