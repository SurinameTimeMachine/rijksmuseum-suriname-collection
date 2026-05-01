import fs from 'fs';
import Papa from 'papaparse';
import path from 'path';

type ProblemBucket =
  | 'thesaurus-no-coords'
  | 'no-geo-details'
  | 'unresolved-only'
  | 'mixed-no-coords';

type InputRow = {
  objectnummer: string;
  titel: string;
  probleem_bucket: ProblemBucket;
  geografisch_trefwoord: string;
  geo_detail_termen: string;
  geo_detail_sources: string;
  geo_detail_broader_terms: string;
};

type NormalizedRow = InputRow & {
  primaryTerm: string;
  termCountInBucket: number;
  bucketPriority: number;
  suggestedAction: string;
};

const DATA_DIR = path.join(process.cwd(), 'data');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');

const PROBLEM_CASES_PATH = path.join(REPORTS_DIR, 'live-location-problem-cases.csv');
const TERM_PRIORITY_PATH = path.join(REPORTS_DIR, 'live-location-problem-term-priority.csv');
const TRIAGE_BATCH_PATH = path.join(REPORTS_DIR, 'live-location-triage-batch-01.csv');

const BUCKET_ORDER: Record<ProblemBucket, number> = {
  'thesaurus-no-coords': 1,
  'no-geo-details': 2,
  'unresolved-only': 3,
  'mixed-no-coords': 4,
};

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_PER_TERM = 5;
const NO_TERM = '(geen term)';

function normalizeForKey(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function makeBucketTermKey(bucket: ProblemBucket, term: string): string {
  return `${bucket}::${normalizeForKey(term)}`;
}

function splitPipeValues(value: string): string[] {
  return String(value || '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
}

function primaryTermFromRow(row: InputRow): string {
  const detailTerms = splitPipeValues(row.geo_detail_termen);
  if (detailTerms.length > 0) return detailTerms[0];

  const keywordTerms = splitPipeValues(row.geografisch_trefwoord);
  if (keywordTerms.length > 0) return keywordTerms[0];

  return NO_TERM;
}

function suggestedActionForBucket(bucket: ProblemBucket): string {
  if (bucket === 'thesaurus-no-coords') {
    return 'Koppel coordinaten aan thesaurusterm (Wikidata/STM), daarna rerun import/report';
  }

  if (bucket === 'no-geo-details') {
    return 'Voeg minimaal Suriname of Paramaribo toe, of markeer expliciet als locatie-onbekend';
  }

  if (bucket === 'unresolved-only') {
    return 'Los unresolved term op via STM/Wikidata mapping en vervang unresolved';
  }

  return 'Normaliseer mix van unresolved/thesaurus naar minimaal 1 map-ready detail';
}

function loadProblemRows(): InputRow[] {
  if (!fs.existsSync(PROBLEM_CASES_PATH)) {
    throw new Error(`Input file ontbreekt: ${PROBLEM_CASES_PATH}`);
  }

  const csvText = fs.readFileSync(PROBLEM_CASES_PATH, 'utf-8');
  const parsed = Papa.parse<InputRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new Error(`CSV parse error: ${parsed.errors[0].message}`);
  }

  return parsed.data.filter((row) => row.objectnummer && row.probleem_bucket);
}

function normalizeRows(rows: InputRow[]): NormalizedRow[] {
  const termCounts = new Map<string, number>();

  for (const row of rows) {
    const bucket = row.probleem_bucket;
    const term = primaryTermFromRow(row);
    const key = makeBucketTermKey(bucket, term);
    termCounts.set(key, (termCounts.get(key) || 0) + 1);
  }

  return rows.map((row) => {
    const bucket = row.probleem_bucket;
    const primaryTerm = primaryTermFromRow(row);
    const termKey = makeBucketTermKey(bucket, primaryTerm);
    return {
      ...row,
      primaryTerm,
      termCountInBucket: termCounts.get(termKey) || 0,
      bucketPriority: BUCKET_ORDER[bucket],
      suggestedAction: suggestedActionForBucket(bucket),
    };
  });
}

function sortRows(rows: NormalizedRow[]): NormalizedRow[] {
  return [...rows].sort((a, b) => {
    if (a.bucketPriority !== b.bucketPriority) return a.bucketPriority - b.bucketPriority;
    if (a.termCountInBucket !== b.termCountInBucket) return b.termCountInBucket - a.termCountInBucket;
    const termCmp = a.primaryTerm.localeCompare(b.primaryTerm, 'nl');
    if (termCmp !== 0) return termCmp;
    return a.objectnummer.localeCompare(b.objectnummer, 'nl');
  });
}

function buildTermPriorityRows(rows: NormalizedRow[]) {
  const groups = new Map<string, { row: NormalizedRow; count: number; samples: string[] }>();

  for (const row of rows) {
    const key = makeBucketTermKey(row.probleem_bucket, row.primaryTerm);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        row,
        count: 1,
        samples: [row.objectnummer],
      });
      continue;
    }

    existing.count += 1;
    if (existing.samples.length < 5) {
      existing.samples.push(row.objectnummer);
    }
  }

  const grouped = Array.from(groups.values()).sort((a, b) => {
    if (a.row.bucketPriority !== b.row.bucketPriority) {
      return a.row.bucketPriority - b.row.bucketPriority;
    }
    if (a.count !== b.count) return b.count - a.count;
    return a.row.primaryTerm.localeCompare(b.row.primaryTerm, 'nl');
  });

  return grouped.map((group, index) => ({
    prioriteit: index + 1,
    probleem_bucket: group.row.probleem_bucket,
    term: group.row.primaryTerm,
    occurrences: group.count,
    sample_objectnummers: group.samples.join(' | '),
    suggested_action: group.row.suggestedAction,
  }));
}

function writeCsv(filePath: string, rows: Array<Record<string, unknown>>) {
  const csv = Papa.unparse(rows, {
    quotes: false,
    newline: '\n',
  });
  fs.writeFileSync(filePath, `${csv}\n`, 'utf-8');
}

function main() {
  const batchSizeArg = Number(process.argv[2]);
  const batchSize = Number.isFinite(batchSizeArg) && batchSizeArg > 0 ? Math.floor(batchSizeArg) : DEFAULT_BATCH_SIZE;
  const maxPerTermArg = Number(process.argv[3]);
  const maxPerTerm =
    Number.isFinite(maxPerTermArg) && maxPerTermArg > 0 ? Math.floor(maxPerTermArg) : DEFAULT_MAX_PER_TERM;

  const rows = loadProblemRows();
  const normalized = normalizeRows(rows);
  const sorted = sortRows(normalized);

  const termPriorityRows = buildTermPriorityRows(sorted);
  writeCsv(TERM_PRIORITY_PATH, termPriorityRows);

  const selectedRows: NormalizedRow[] = [];
  const selectedPerTerm = new Map<string, number>();

  for (const row of sorted) {
    const key = makeBucketTermKey(row.probleem_bucket, row.primaryTerm);
    const currentCount = selectedPerTerm.get(key) || 0;
    if (currentCount >= maxPerTerm) continue;

    selectedRows.push(row);
    selectedPerTerm.set(key, currentCount + 1);

    if (selectedRows.length >= batchSize) break;
  }

  const triageBatchRows = selectedRows.map((row, index) => ({
    priority_rank: index + 1,
    probleem_bucket: row.probleem_bucket,
    primary_term: row.primaryTerm,
    term_occurrences_in_bucket: row.termCountInBucket,
    suggested_action: row.suggestedAction,
    objectnummer: row.objectnummer,
    titel: row.titel,
    geografisch_trefwoord: row.geografisch_trefwoord,
    geo_detail_termen: row.geo_detail_termen,
    geo_detail_sources: row.geo_detail_sources,
    geo_detail_broader_terms: row.geo_detail_broader_terms,
  }));
  writeCsv(TRIAGE_BATCH_PATH, triageBatchRows);

  console.log(`Wrote term priority report: ${TERM_PRIORITY_PATH} (${termPriorityRows.length})`);
  console.log(
    `Wrote triage batch: ${TRIAGE_BATCH_PATH} (${triageBatchRows.length}) with max ${maxPerTerm} rows per bucket+term`,
  );
}

main();