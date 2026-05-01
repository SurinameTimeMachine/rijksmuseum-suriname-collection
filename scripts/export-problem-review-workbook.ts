import fs from 'fs';
import Papa from 'papaparse';
import path from 'path';
import * as XLSX from 'xlsx';

type CliOptions = {
  inputWorkbookPath: string;
  problemCsvPath: string;
  outputWorkbookPath: string;
  includeObjectOnlyFallback: boolean;
};

type ProblemRow = {
  objectnummer: string;
  geografisch_trefwoord: string;
  geo_detail_termen: string;
};

type EvaluationRow = Record<string, unknown> & {
  objectnummer?: string;
  geografisch_trefwoord?: string;
  rijksmuseum_geografisch_trefwoord_atomair?: string;
};

type Summary = {
  totalEvaluationRows: number;
  totalProblemRows: number;
  uniqueProblemObjects: number;
  matchedRows: number;
  matchedByObjectAndTerm: number;
  matchedByObjectFallback: number;
  excludedReviewedOrAnnotated: number;
  excludedOutOfScope: number;
  excludedAlreadyCuratedWithCoords: number;
  unmatchedProblemObjects: number;
};

const DATA_DIR = path.join(process.cwd(), 'data');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');
const DEFAULT_INPUT_WORKBOOK = path.join(REPORTS_DIR, 'location-review.xlsx');
const DEFAULT_PROBLEM_CSV = path.join(REPORTS_DIR, 'live-location-problem-cases.csv');
const DEFAULT_OUTPUT_WORKBOOK = path.join(REPORTS_DIR, 'location-review-problem-cases.xlsx');

function normalizeForKey(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function splitPipeValues(value: string): string[] {
  return String(value || '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseCliArgs(): CliOptions {
  const args = process.argv.slice(2);

  let inputWorkbookPath = DEFAULT_INPUT_WORKBOOK;
  let problemCsvPath = DEFAULT_PROBLEM_CSV;
  let outputWorkbookPath = DEFAULT_OUTPUT_WORKBOOK;
  let includeObjectOnlyFallback = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--input') {
      inputWorkbookPath = path.resolve(process.cwd(), args[index + 1] || '');
      index += 1;
      continue;
    }

    if (arg === '--problem-csv') {
      problemCsvPath = path.resolve(process.cwd(), args[index + 1] || '');
      index += 1;
      continue;
    }

    if (arg === '--output') {
      outputWorkbookPath = path.resolve(process.cwd(), args[index + 1] || '');
      index += 1;
      continue;
    }

    if (arg === '--object-fallback') {
      includeObjectOnlyFallback = true;
      continue;
    }

    if (arg === '--no-object-fallback') {
      includeObjectOnlyFallback = false;
      continue;
    }
  }

  return {
    inputWorkbookPath,
    problemCsvPath,
    outputWorkbookPath,
    includeObjectOnlyFallback,
  };
}

function ensureFileExists(filePath: string, label: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function buildProblemTermMap(rows: ProblemRow[]): Map<string, Set<string>> {
  const termsByObject = new Map<string, Set<string>>();

  for (const row of rows) {
    const objectnummer = String(row.objectnummer || '').trim();
    if (!objectnummer) continue;

    if (!termsByObject.has(objectnummer)) {
      termsByObject.set(objectnummer, new Set<string>());
    }

    const termSet = termsByObject.get(objectnummer)!;
    const terms = [
      ...splitPipeValues(row.geo_detail_termen),
      ...splitPipeValues(row.geografisch_trefwoord),
    ];

    for (const term of terms) {
      termSet.add(normalizeForKey(term));
    }
  }

  return termsByObject;
}

function pickRowTerm(row: EvaluationRow): string {
  const atomic = String(row.rijksmuseum_geografisch_trefwoord_atomair || '').trim();
  if (atomic) return atomic;
  return String(row.geografisch_trefwoord || '').trim();
}

function toTrimmedString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toNullableNumber(value: unknown): number | null {
  const text = toTrimmedString(value);
  if (!text) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function hasAnyManualInput(row: EvaluationRow): boolean {
  const status = toTrimmedString(row.ef_review_status);
  const loc = toTrimmedString(row.ef_review_locatie);
  const note = toTrimmedString(row.ef_review_opmerking);
  return Boolean(status || loc || note);
}

function isOutOfScope(row: EvaluationRow): boolean {
  const note = normalizeForKey(toTrimmedString(row.ef_review_opmerking));
  return note.includes('niet-suriname') || note.includes('niet suriname');
}

function hasCurrentCuratedCoords(row: EvaluationRow): boolean {
  const lat = toNullableNumber(row.huidige_curatie_lat);
  const lng = toNullableNumber(row.huidige_curatie_lng);
  return lat !== null && lng !== null;
}

function filterEvaluationRows(
  rows: EvaluationRow[],
  termsByObject: Map<string, Set<string>>,
  includeObjectOnlyFallback: boolean,
): { filteredRows: EvaluationRow[]; summary: Summary } {
  let matchedByObjectAndTerm = 0;
  let matchedByObjectFallback = 0;
  let excludedReviewedOrAnnotated = 0;
  let excludedOutOfScope = 0;
  let excludedAlreadyCuratedWithCoords = 0;

  const filteredRows = rows.filter((row) => {
    const objectnummer = String(row.objectnummer || '').trim();
    if (!objectnummer) return false;

    const termSet = termsByObject.get(objectnummer);
    if (!termSet) return false;

    const normalizedRowTerm = normalizeForKey(pickRowTerm(row));
    let isProblemMatch = false;

    if (normalizedRowTerm && termSet.has(normalizedRowTerm)) {
      matchedByObjectAndTerm += 1;
      isProblemMatch = true;
    }

    if (!isProblemMatch && includeObjectOnlyFallback) {
      matchedByObjectFallback += 1;
      isProblemMatch = true;
    }

    if (!isProblemMatch) return false;

    if (isOutOfScope(row)) {
      excludedOutOfScope += 1;
      return false;
    }

    if (hasAnyManualInput(row)) {
      excludedReviewedOrAnnotated += 1;
      return false;
    }

    if (hasCurrentCuratedCoords(row)) {
      excludedAlreadyCuratedWithCoords += 1;
      return false;
    }

    return true;
  });

  const matchedObjects = new Set(
    filteredRows
      .map((row) => String(row.objectnummer || '').trim())
      .filter(Boolean),
  );

  const unmatchedProblemObjects = Array.from(termsByObject.keys()).filter(
    (objectnummer) => !matchedObjects.has(objectnummer),
  ).length;

  const summary: Summary = {
    totalEvaluationRows: rows.length,
    totalProblemRows: 0,
    uniqueProblemObjects: termsByObject.size,
    matchedRows: filteredRows.length,
    matchedByObjectAndTerm,
    matchedByObjectFallback,
    excludedReviewedOrAnnotated,
    excludedOutOfScope,
    excludedAlreadyCuratedWithCoords,
    unmatchedProblemObjects,
  };

  return { filteredRows, summary };
}

function makeWorksheet<T extends object>(rows: T[]): XLSX.WorkSheet {
  return XLSX.utils.json_to_sheet(rows, { skipHeader: false });
}

function main() {
  const options = parseCliArgs();

  ensureFileExists(options.inputWorkbookPath, 'Input workbook');
  ensureFileExists(options.problemCsvPath, 'Problem CSV');

  const csvContent = fs.readFileSync(options.problemCsvPath, 'utf-8');
  const csvParsed = Papa.parse<ProblemRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  if (csvParsed.errors.length > 0) {
    const messages = csvParsed.errors.map((error) => error.message).join('; ');
    throw new Error(`Could not parse problem CSV: ${messages}`);
  }

  const problemRows = csvParsed.data;
  const termsByObject = buildProblemTermMap(problemRows);

  const workbook = XLSX.readFile(options.inputWorkbookPath);
  const evaluationSheet = workbook.Sheets.Evaluatie;
  if (!evaluationSheet) {
    throw new Error('Input workbook does not contain required sheet: Evaluatie');
  }

  const evaluationRows = XLSX.utils.sheet_to_json<EvaluationRow>(evaluationSheet, {
    defval: '',
  });

  const { filteredRows, summary } = filterEvaluationRows(
    evaluationRows,
    termsByObject,
    options.includeObjectOnlyFallback,
  );

  summary.totalProblemRows = problemRows.length;

  const outputWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outputWorkbook, makeWorksheet(filteredRows), 'Evaluatie');

  const summaryRows = [
    { metric: 'input_workbook', value: options.inputWorkbookPath },
    { metric: 'problem_csv', value: options.problemCsvPath },
    { metric: 'output_workbook', value: options.outputWorkbookPath },
    { metric: 'total_evaluation_rows', value: summary.totalEvaluationRows },
    { metric: 'total_problem_rows', value: summary.totalProblemRows },
    { metric: 'unique_problem_objects', value: summary.uniqueProblemObjects },
    { metric: 'matched_rows', value: summary.matchedRows },
    { metric: 'matched_by_object_and_term', value: summary.matchedByObjectAndTerm },
    { metric: 'matched_by_object_fallback', value: summary.matchedByObjectFallback },
    { metric: 'excluded_reviewed_or_annotated', value: summary.excludedReviewedOrAnnotated },
    { metric: 'excluded_out_of_scope', value: summary.excludedOutOfScope },
    { metric: 'excluded_already_curated_with_coords', value: summary.excludedAlreadyCuratedWithCoords },
    { metric: 'unmatched_problem_objects', value: summary.unmatchedProblemObjects },
    {
      metric: 'object_only_fallback_enabled',
      value: options.includeObjectOnlyFallback ? 'yes' : 'no',
    },
  ];

  XLSX.utils.book_append_sheet(outputWorkbook, makeWorksheet(summaryRows), 'Samenvatting');

  const problemObjectRows = Array.from(termsByObject.entries()).map(([objectnummer, termSet]) => ({
    objectnummer,
    problem_terms: Array.from(termSet.values()).join(' | '),
  }));
  XLSX.utils.book_append_sheet(outputWorkbook, makeWorksheet(problemObjectRows), 'Probleemobjecten');

  XLSX.writeFile(outputWorkbook, options.outputWorkbookPath, { cellStyles: true });

  console.log(`Wrote filtered workbook to ${options.outputWorkbookPath}`);
  console.log(
    `Kept ${summary.matchedRows} of ${summary.totalEvaluationRows} evaluation rows for ${summary.uniqueProblemObjects} problem objects.`,
  );
}

main();
