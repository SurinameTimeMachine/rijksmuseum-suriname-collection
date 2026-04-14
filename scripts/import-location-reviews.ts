import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

import {
  appendLocationEdit,
  buildLatestLocationEditMap,
  loadLocationEdits,
  normalizeWikidataReference,
} from '../lib/location-curation';
import type {
  LocationEditRecord,
  LocationEvidenceSource,
  LocationResolutionLevel,
} from '../types/collection';

type ConflictPolicy = 'skip' | 'overwrite';

type CliOptions = {
  sourcePath: string;
  author: string;
  dryRun: boolean;
  conflictPolicy: ConflictPolicy;
  summaryOutPath: string | null;
};

type EvaluationRow = {
  recordnummer: unknown;
  objectnummer: unknown;
  geografisch_trefwoord: unknown;
  beste_locatiesuggestie: unknown;
  rijksmuseum_geografisch_trefwoord_atomair: unknown;
  term_index: unknown;
  ef_review_locatie: unknown;
  ef_review_opmerking: unknown;
  huidige_curatie_label: unknown;
  huidige_curatie_qid: unknown;
  huidige_curatie_wikidata_uri: unknown;
  huidige_curatie_lat: unknown;
  huidige_curatie_lng: unknown;
  huidige_curatie_resolution_level: unknown;
  beste_beschikbare_locatie_label: unknown;
  beste_beschikbare_locatie_qid: unknown;
  beste_beschikbare_locatie_lat: unknown;
  beste_beschikbare_locatie_lng: unknown;
  beste_beschikbare_locatie_resolution_level: unknown;
};

type ImportSummary = {
  sourcePath: string;
  dryRun: boolean;
  author: string;
  conflictPolicy: ConflictPolicy;
  rowsRead: number;
  reviewRows: number;
  imported: number;
  skippedConflict: number;
  skippedUnmatched: number;
  skippedNoTerm: number;
  skippedRemarkOnly: number;
  skippedAlreadyCurrent: number;
  errors: number;
  errorDetails: string[];
  timestamp: string;
};

type CandidateLocation = {
  label: string;
  qid: string | null;
  wikidataUrl: string | null;
  lat: number | null;
  lng: number | null;
  resolutionLevel: LocationResolutionLevel;
};

function parseCliArgs(): CliOptions {
  const args = process.argv.slice(2);

  let sourcePath = '';
  let author = 'xlsx-import';
  let dryRun = false;
  let conflictPolicy: ConflictPolicy = 'skip';
  let summaryOutPath: string | null = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--source') {
      sourcePath = args[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--author') {
      author = (args[i + 1] || '').trim() || author;
      i += 1;
      continue;
    }

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg.startsWith('--conflict=')) {
      const value = arg.slice('--conflict='.length);
      if (value === 'skip' || value === 'overwrite') {
        conflictPolicy = value;
      }
      continue;
    }

    if (arg === '--summary-out') {
      summaryOutPath = args[i + 1] ? path.resolve(process.cwd(), args[i + 1]) : null;
      i += 1;
      continue;
    }
  }

  if (!sourcePath) {
    throw new Error('Missing required argument: --source <path-to-xlsx>');
  }

  return {
    sourcePath: path.resolve(process.cwd(), sourcePath),
    author,
    dryRun,
    conflictPolicy,
    summaryOutPath,
  };
}

function toTrimmedString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toNullableNumber(value: unknown): number | null {
  const str = toTrimmedString(value);
  if (!str) return null;
  const numeric = Number(str);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeTerm(row: EvaluationRow): string {
  const atomic = toTrimmedString(row.rijksmuseum_geografisch_trefwoord_atomair);
  if (atomic) return atomic;
  return toTrimmedString(row.geografisch_trefwoord);
}

function normalizeResolution(value: string): LocationResolutionLevel | null {
  if (value === 'exact' || value === 'broader' || value === 'city' || value === 'country') {
    return value;
  }
  return null;
}

function pickCandidateLocation(row: EvaluationRow, reviewLoc: string): CandidateLocation | null {
  const isConfirm = reviewLoc.toLowerCase() === 'y';

  const currentLabel = toTrimmedString(row.huidige_curatie_label);
  const bestLabel = toTrimmedString(row.beste_beschikbare_locatie_label);

  if (isConfirm) {
    const label = currentLabel || bestLabel;
    const bestSuggestionRaw = toTrimmedString(row.beste_locatiesuggestie);
    const bestSuggestionLabel = bestSuggestionRaw ? bestSuggestionRaw.split('|')[0].trim() : '';
    const finalLabel = label || bestSuggestionLabel;
    if (!finalLabel) return null;

    const qidRaw = toTrimmedString(row.huidige_curatie_qid) || toTrimmedString(row.beste_beschikbare_locatie_qid);
    const qidRef = normalizeWikidataReference(qidRaw);
    const explicitUrl = toTrimmedString(row.huidige_curatie_wikidata_uri);

    const resolution =
      normalizeResolution(toTrimmedString(row.huidige_curatie_resolution_level)) ||
      normalizeResolution(toTrimmedString(row.beste_beschikbare_locatie_resolution_level)) ||
      'broader';

    return {
      label: finalLabel,
      qid: qidRef.qid,
      wikidataUrl: explicitUrl || qidRef.url,
      lat: toNullableNumber(row.huidige_curatie_lat) ?? toNullableNumber(row.beste_beschikbare_locatie_lat),
      lng: toNullableNumber(row.huidige_curatie_lng) ?? toNullableNumber(row.beste_beschikbare_locatie_lng),
      resolutionLevel: resolution,
    };
  }

  const qidRef = normalizeWikidataReference(reviewLoc);
  const label = reviewLoc;

  const resolution =
    normalizeResolution(toTrimmedString(row.huidige_curatie_resolution_level)) ||
    normalizeResolution(toTrimmedString(row.beste_beschikbare_locatie_resolution_level)) ||
    'broader';

  return {
    label,
    qid: qidRef.qid,
    wikidataUrl: qidRef.url,
    lat: null,
    lng: null,
    resolutionLevel: resolution,
  };
}

function sameAsLatest(latest: LocationEditRecord, incoming: LocationEditRecord): boolean {
  return (
    latest.resolvedLocationLabel === incoming.resolvedLocationLabel &&
    latest.wikidataQid === incoming.wikidataQid &&
    latest.wikidataUrl === incoming.wikidataUrl &&
    latest.gazetteerUrl === incoming.gazetteerUrl &&
    latest.lat === incoming.lat &&
    latest.lng === incoming.lng &&
    latest.resolutionLevel === incoming.resolutionLevel &&
    latest.evidenceSource === incoming.evidenceSource &&
    latest.evidenceText === incoming.evidenceText &&
    latest.remark === incoming.remark
  );
}

function ensureBackup(locationEditsPath: string): string | null {
  if (!fs.existsSync(locationEditsPath)) return null;

  const backupDir = path.join(path.dirname(locationEditsPath), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `location-edits-${stamp}.jsonl.bak`);
  fs.copyFileSync(locationEditsPath, backupPath);
  return backupPath;
}

function toEvidenceSource(reviewLoc: string): LocationEvidenceSource {
  return reviewLoc.toLowerCase() === 'y' ? 'bevestigd' : 'beschrijving';
}

function writeSummary(summaryPath: string, summary: ImportSummary) {
  const parent = path.dirname(summaryPath);
  if (!fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');
}

function main() {
  const options = parseCliArgs();

  if (!fs.existsSync(options.sourcePath)) {
    throw new Error(`Source workbook not found: ${options.sourcePath}`);
  }

  const workbook = XLSX.readFile(options.sourcePath);
  const sheet = workbook.Sheets.Evaluatie;
  if (!sheet) {
    throw new Error('Workbook does not contain required sheet: Evaluatie');
  }

  const rows = XLSX.utils.sheet_to_json<EvaluationRow>(sheet, { defval: '' });
  const existing = loadLocationEdits();
  const latestByKey = buildLatestLocationEditMap(existing);

  const summary: ImportSummary = {
    sourcePath: options.sourcePath,
    dryRun: options.dryRun,
    author: options.author,
    conflictPolicy: options.conflictPolicy,
    rowsRead: rows.length,
    reviewRows: 0,
    imported: 0,
    skippedConflict: 0,
    skippedUnmatched: 0,
    skippedNoTerm: 0,
    skippedRemarkOnly: 0,
    skippedAlreadyCurrent: 0,
    errors: 0,
    errorDetails: [],
    timestamp: new Date().toISOString(),
  };

  let backupPath: string | null = null;
  const locationEditsPath = path.join(process.cwd(), 'data', 'location-edits.jsonl');

  for (let idx = 0; idx < rows.length; idx += 1) {
    const row = rows[idx];
    const excelLine = idx + 2;

    const reviewLoc = toTrimmedString(row.ef_review_locatie);
    const reviewRemark = toTrimmedString(row.ef_review_opmerking);

    if (!reviewLoc && !reviewRemark) continue;
    summary.reviewRows += 1;

    if (!reviewLoc && reviewRemark) {
      summary.skippedRemarkOnly += 1;
      continue;
    }

    const recordnummer = Number.parseInt(toTrimmedString(row.recordnummer), 10);
    const objectnummer = toTrimmedString(row.objectnummer);
    const originalTerm = normalizeTerm(row);

    if (!originalTerm) {
      summary.skippedNoTerm += 1;
      continue;
    }

    if (!Number.isFinite(recordnummer) || !objectnummer) {
      summary.skippedUnmatched += 1;
      summary.errors += 1;
      summary.errorDetails.push(
        `Line ${excelLine}: missing key fields (recordnummer/objectnummer).`,
      );
      continue;
    }

    const candidate = pickCandidateLocation(row, reviewLoc || 'Y');
    if (!candidate) {
      summary.skippedUnmatched += 1;
      summary.errors += 1;
      summary.errorDetails.push(
        `Line ${excelLine}: could not derive target location label for review value "${reviewLoc}".`,
      );
      continue;
    }

    const key = `${recordnummer}::${originalTerm.toLowerCase()}`;
    const existingLatest = latestByKey.get(key);

    const incoming: LocationEditRecord = {
      recordnummer,
      objectnummer,
      originalTerm,
      resolvedLocationLabel: candidate.label,
      wikidataQid: candidate.qid,
      wikidataUrl: candidate.wikidataUrl,
      gazetteerUrl: null,
      lat: candidate.lat,
      lng: candidate.lng,
      resolutionLevel: candidate.resolutionLevel,
      evidenceSource: toEvidenceSource(reviewLoc || 'Y'),
      evidenceText: reviewRemark || null,
      author: options.author,
      timestamp: new Date().toISOString(),
      remark: reviewRemark || null,
    };

    if (existingLatest && sameAsLatest(existingLatest, incoming)) {
      summary.skippedAlreadyCurrent += 1;
      continue;
    }

    if (existingLatest && options.conflictPolicy === 'skip') {
      summary.skippedConflict += 1;
      continue;
    }

    if (!options.dryRun) {
      if (!backupPath) {
        backupPath = ensureBackup(locationEditsPath);
      }
      appendLocationEdit(incoming);
      latestByKey.set(key, incoming);
    }

    summary.imported += 1;
  }

  if (options.summaryOutPath) {
    writeSummary(options.summaryOutPath, summary);
  }

  if (!options.dryRun && backupPath) {
    console.log(`Backup created: ${backupPath}`);
  }

  console.log(
    [
      `Import summary (${options.dryRun ? 'dry-run' : 'write'}):`,
      `rowsRead=${summary.rowsRead}`,
      `reviewRows=${summary.reviewRows}`,
      `imported=${summary.imported}`,
      `skippedConflict=${summary.skippedConflict}`,
      `skippedUnmatched=${summary.skippedUnmatched}`,
      `skippedNoTerm=${summary.skippedNoTerm}`,
      `skippedRemarkOnly=${summary.skippedRemarkOnly}`,
      `skippedAlreadyCurrent=${summary.skippedAlreadyCurrent}`,
      `errors=${summary.errors}`,
    ].join(' '),
  );

  if (summary.errorDetails.length > 0) {
    for (const line of summary.errorDetails.slice(0, 20)) {
      console.warn(line);
    }
    if (summary.errorDetails.length > 20) {
      console.warn(`...and ${summary.errorDetails.length - 20} more errors`);
    }
  }
}

main();
