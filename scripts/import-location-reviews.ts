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
  ef_review_status: unknown;
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
  importedRejected: number;
  skippedConflict: number;
  skippedUnmatched: number;
  skippedNoTerm: number;
  skippedRemarkOnly: number;
  skippedNegativeReview: number;
  skippedOutOfScope: number;
  skippedEmptyAccept: number;
  skippedAlreadyCurrent: number;
  skippedNietSuriname: number;
  errors: number;
  errorDetails: string[];
  timestamp: string;
};

type ReviewStatus = 'accept' | 'remove-broader' | 'reject' | 'custom' | 'out-of-scope';

type CandidateLocation = {
  label: string;
  qid: string | null;
  wikidataUrl: string | null;
  lat: number | null;
  lng: number | null;
  resolutionLevel: LocationResolutionLevel;
};

const BROADER_TERMS = ['Suriname (Zuid-Amerika)', 'Paramaribo (stad)', 'Suriname', 'Paramaribo'];

function parseCliArgs(): CliOptions {
  const args = process.argv.slice(2);

  let sourcePath = '';
  let author = 'Thunnis van Oort';
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

function normalizeReviewStatus(value: unknown): ReviewStatus | null {
  const normalized = toTrimmedString(value).toLowerCase();
  if (normalized === 'accept' || normalized === 'a' || normalized === 'y') return 'accept';
  if (normalized === 'remove-broader') return 'remove-broader';
  if (normalized === 'reject' || normalized === 'r' || normalized === 'x') return 'reject';
  if (normalized === 'custom' || normalized === 'c') return 'custom';
  if (normalized === 'out-of-scope') return 'out-of-scope';
  return null;
}

function deriveLegacyReviewStatus(reviewLoc: string): ReviewStatus | null {
  const normalized = reviewLoc.toLowerCase();
  if (normalized === 'y') return 'accept';
  if (normalized === 'x') return 'reject';
  if (normalized === 'b') return 'out-of-scope';
  if (reviewLoc) return 'custom';
  return null;
}

const SURINAME_SHORTHAND: CandidateLocation = {
  label: 'Suriname',
  qid: 'Q730',
  wikidataUrl: 'https://www.wikidata.org/wiki/Q730',
  lat: 4.0,
  lng: -56.0,
  resolutionLevel: 'country',
};

function pickCandidateLocation(row: EvaluationRow, reviewStatus: ReviewStatus, reviewLoc: string): CandidateLocation | null {
  if (reviewStatus === 'reject' || reviewStatus === 'remove-broader') return null;
  
  const normalizedLoc = reviewLoc.toLowerCase();
  if (normalizedLoc === 's') return SURINAME_SHORTHAND;
  const isAccept = reviewStatus === 'accept';

  const currentLabel = toTrimmedString(row.huidige_curatie_label);
  const bestLabel = toTrimmedString(row.beste_beschikbare_locatie_label);

  if (isAccept) {
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
  const sheetName = 'Evaluatie';
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Workbook does not contain required sheet: ${sheetName}`);
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
    importedRejected: 0,
    skippedConflict: 0,
    skippedUnmatched: 0,
    skippedNoTerm: 0,
    skippedRemarkOnly: 0,
    skippedNegativeReview: 0,
    skippedOutOfScope: 0,
    skippedEmptyAccept: 0,
    skippedAlreadyCurrent: 0,
    skippedNietSuriname: 0,
    errors: 0,
    errorDetails: [],
    timestamp: new Date().toISOString(),
  };

  // Group by objectnummer
  const groups = new Map<string, EvaluationRow[]>();
  for (const row of rows) {
    const objectnummer = toTrimmedString(row.objectnummer);
    if (!objectnummer) continue;
    if (!groups.has(objectnummer)) groups.set(objectnummer, []);
    groups.get(objectnummer)!.push(row);
  }

  let backupPath: string | null = null;
  const locationEditsPath = path.join(process.cwd(), 'data', 'location-edits.jsonl');

  for (const [objectnummer, groupRows] of groups.entries()) {
    // Determine if we have "specific" locations in this group (not Suriname/Paramaribo)
    // and they are either accepted or custom.
    const hasSpecific = groupRows.some(row => {
        const term = normalizeTerm(row);
        const remark = toTrimmedString(row.ef_review_opmerking).toLowerCase();
        if (remark.includes('niet-suriname')) return false;
        
        const status = normalizeReviewStatus(row.ef_review_status);
        const isSpecific = !BROADER_TERMS.includes(term);
        return isSpecific && (status === 'accept' || status === 'custom');
    });

    for (const row of groupRows) {
      const explicitStatus = normalizeReviewStatus(row.ef_review_status);
      const reviewLoc = toTrimmedString(row.ef_review_locatie);
      const reviewRemark = toTrimmedString(row.ef_review_opmerking);
      const reviewStatus = explicitStatus || deriveLegacyReviewStatus(reviewLoc);

      if (!reviewStatus && !reviewLoc && !reviewRemark) continue;
      summary.reviewRows += 1;

      if (reviewRemark.toLowerCase().includes('niet-suriname')) {
          summary.skippedNietSuriname += 1;
          continue;
      }

      if (!reviewStatus && !reviewLoc && reviewRemark) {
        summary.skippedRemarkOnly += 1;
        continue;
      }

      if (reviewStatus === 'out-of-scope') {
        summary.skippedOutOfScope += 1;
        continue;
      }

      const recordnummer = Number.parseInt(toTrimmedString(row.recordnummer), 10);
      const originalTerm = normalizeTerm(row);

      if (!originalTerm) {
        summary.skippedNoTerm += 1;
        continue;
      }

      if (!Number.isFinite(recordnummer)) {
        summary.skippedUnmatched += 1;
        summary.errors += 1;
        summary.errorDetails.push(
          `Object ${objectnummer}, Term ${originalTerm}: missing recordnummer.`,
        );
        continue;
      }

      let evidenceSource: LocationEvidenceSource = 'bevestigd';
      let candidate: CandidateLocation | null = null;

      const isBroader = BROADER_TERMS.includes(originalTerm);
      
      if (reviewStatus === 'reject') {
          summary.skippedNegativeReview += 1;
          continue;
      }

      if (reviewStatus === 'remove-broader' || (isBroader && hasSpecific)) {
          evidenceSource = 'rejected';
          candidate = {
              label: originalTerm,
              qid: null,
              wikidataUrl: null,
              lat: null,
              lng: null,
              resolutionLevel: 'broader'
          };
      } else {
          candidate = pickCandidateLocation(
            row,
            reviewStatus || 'accept',
            reviewLoc || 'Y',
          );
      }

      if (!candidate) {
        if (reviewStatus === 'accept') {
          summary.skippedEmptyAccept += 1;
          continue;
        }
        summary.skippedUnmatched += 1;
        summary.errors += 1;
        summary.errorDetails.push(
          `Object ${objectnummer}, Term ${originalTerm}: could not derive target location for review value "${reviewLoc}".`,
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
        evidenceSource: evidenceSource,
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

      if (evidenceSource === 'rejected') {
          summary.importedRejected += 1;
      }
      summary.imported += 1;
    }
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
      `importedRejected=${summary.importedRejected}`,
      `skippedConflict=${summary.skippedConflict}`,
      `skippedUnmatched=${summary.skippedUnmatched}`,
      `skippedNoTerm=${summary.skippedNoTerm}`,
      `skippedRemarkOnly=${summary.skippedRemarkOnly}`,
      `skippedNegativeReview=${summary.skippedNegativeReview}`,
      `skippedOutOfScope=${summary.skippedOutOfScope}`,
      `skippedEmptyAccept=${summary.skippedEmptyAccept}`,
      `skippedAlreadyCurrent=${summary.skippedAlreadyCurrent}`,
      `skippedNietSuriname=${summary.skippedNietSuriname}`,
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
