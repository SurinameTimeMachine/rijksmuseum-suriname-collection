import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

import {
  appendLocationEdit,
  applyStmFirstLocation,
  buildLatestLocationEditMap,
  loadLocationEdits,
  normalizeWikidataReference,
  resolveWikidataCoordinates,
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
  thesaurus_match_label: unknown;
  thesaurus_wikidata_qid: unknown;
  thesaurus_wikidata_uri: unknown;
  thesaurus_lat: unknown;
  thesaurus_lng: unknown;
  thesaurus_resolution_level: unknown;
  stm_gazetteer_suggestie_id: unknown;
  stm_gazetteer_suggestie_label: unknown;
  stm_gazetteer_suggestie_qid: unknown;
  stm_gazetteer_suggestie_lat: unknown;
  stm_gazetteer_suggestie_lng: unknown;
  voorgestelde_eindlabel: unknown;
  voorgestelde_eind_qid: unknown;
  voorgestelde_eind_lat: unknown;
  voorgestelde_eind_lng: unknown;
  voorgestelde_eind_resolution_level: unknown;
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
  gazetteerUrl: string | null;
  lat: number | null;
  lng: number | null;
  resolutionLevel: LocationResolutionLevel;
};

type WorkbookCandidateLocation = CandidateLocation & {
  stmId: string | null;
};

type StmGazetteerName = {
  text?: string;
  isPreferred?: boolean;
};

type StmGazetteerPlace = {
  '@id'?: string;
  id?: string;
  type?: string;
  wikidataQid?: string | null;
  location?: {
    lat?: number | null;
    lng?: number | null;
  } | null;
  names?: StmGazetteerName[];
};

type StmGazetteerDataset = {
  '@graph'?: StmGazetteerPlace[];
};

type StmGazetteerResolvedPlace = {
  stmId: string;
  gazetteerUrl: string | null;
  label: string;
  qid: string | null;
  wikidataUrl: string | null;
  lat: number | null;
  lng: number | null;
};

type StmGazetteerIndexes = {
  byId: Map<string, StmGazetteerResolvedPlace>;
  byQid: Map<string, StmGazetteerResolvedPlace>;
  byLabel: Map<string, StmGazetteerResolvedPlace>;
};

const BROADER_TERMS = ['Suriname (Zuid-Amerika)', 'Paramaribo (stad)', 'Suriname', 'Paramaribo'];
const STM_GAZETTEER_PATH = path.join(process.cwd(), 'data', 'places-gazetteer.jsonld');

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
  gazetteerUrl: null,
  lat: 4.0,
  lng: -56.0,
  resolutionLevel: 'country',
};

function normalizeLocationKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function makeLooseMatcherKey(value: string): string {
  return normalizeLocationKey(value).replace(/[^a-z0-9]+/g, '');
}

function normalizeReviewLocationInput(value: string): string {
  return value
    .replace(/\s*\[[^\]]*\]\s*$/g, '')
    .split('|')[0]
    .trim();
}

function extractDirectRefFromInput(input: string): CandidateLocation | null {
  const qidRef = normalizeWikidataReference(input);
  if (qidRef.qid || qidRef.url) {
    const wikiCoords = qidRef.qid ? resolveWikidataCoordinates(qidRef.qid) : null;
    return {
      label: normalizeReviewLocationInput(input) || input,
      qid: qidRef.qid,
      wikidataUrl: qidRef.url,
      gazetteerUrl: null,
      lat: wikiCoords?.lat ?? null,
      lng: wikiCoords?.lng ?? null,
      resolutionLevel: 'exact',
    };
  }

  const stmMatch = input.match(/\bstm-[a-z0-9-]+\b/i);
  if (stmMatch) {
    return {
      label: normalizeReviewLocationInput(input) || stmMatch[0],
      qid: null,
      wikidataUrl: null,
      gazetteerUrl: `https://data.suriname-timemachine.org/place/${stmMatch[0].toLowerCase()}`,
      lat: null,
      lng: null,
      resolutionLevel: 'exact',
    };
  }

  return null;
}

function buildCandidateLocation(partial: Partial<WorkbookCandidateLocation>): WorkbookCandidateLocation | null {
  const label = toTrimmedString(partial.label);
  const qidRef = normalizeWikidataReference(toTrimmedString(partial.qid || partial.wikidataUrl || ''));
  const qid = qidRef.qid;
  const wikidataUrl = toTrimmedString(partial.wikidataUrl) || qidRef.url;
  const stmId = toTrimmedString(partial.stmId) || null;
  const gazetteerUrl = toTrimmedString(partial.gazetteerUrl) || (stmId ? `https://data.suriname-timemachine.org/place/${stmId}` : null);
  const resolutionLevel = partial.resolutionLevel || 'broader';

  if (!label && !qid && !stmId) return null;

  return {
    label: label || qid || stmId || '',
    qid,
    wikidataUrl,
    gazetteerUrl,
    lat: partial.lat ?? null,
    lng: partial.lng ?? null,
    resolutionLevel,
    stmId,
  };
}

function loadStmGazetteerIndexes(): StmGazetteerIndexes {
  const byId = new Map<string, StmGazetteerResolvedPlace>();
  const byQid = new Map<string, StmGazetteerResolvedPlace>();
  const byLabel = new Map<string, StmGazetteerResolvedPlace>();

  if (!fs.existsSync(STM_GAZETTEER_PATH)) {
    return { byId, byQid, byLabel };
  }

  try {
    const dataset = JSON.parse(fs.readFileSync(STM_GAZETTEER_PATH, 'utf-8')) as StmGazetteerDataset;
    for (const place of dataset['@graph'] || []) {
      const stmId = toTrimmedString(place.id);
      if (!stmId) continue;

      const preferredName = (place.names || []).find((name) => name.isPreferred)?.text;
      const fallbackName = (place.names || []).find((name) => toTrimmedString(name.text))?.text;
      const label = toTrimmedString(preferredName || fallbackName || stmId);
      const qidRef = normalizeWikidataReference(toTrimmedString(place.wikidataQid || ''));
      const resolved: StmGazetteerResolvedPlace = {
        stmId,
        gazetteerUrl: toTrimmedString(place['@id']) || `https://data.suriname-timemachine.org/place/${stmId}`,
        label,
        qid: qidRef.qid,
        wikidataUrl: qidRef.url,
        lat: place.location?.lat ?? null,
        lng: place.location?.lng ?? null,
      };

      byId.set(normalizeLocationKey(stmId), resolved);
      if (resolved.qid) byQid.set(normalizeLocationKey(resolved.qid), resolved);
      byLabel.set(normalizeLocationKey(label), resolved);

      for (const name of place.names || []) {
        const text = toTrimmedString(name.text);
        if (text) byLabel.set(normalizeLocationKey(text), resolved);
      }
    }
  } catch {
    return { byId, byQid, byLabel };
  }

  return { byId, byQid, byLabel };
}

function buildWorkbookCandidates(row: EvaluationRow): WorkbookCandidateLocation[] {
  const candidates = [
    buildCandidateLocation({
      label: toTrimmedString(row.huidige_curatie_label),
      qid: toTrimmedString(row.huidige_curatie_qid),
      wikidataUrl: toTrimmedString(row.huidige_curatie_wikidata_uri),
      lat: toNullableNumber(row.huidige_curatie_lat),
      lng: toNullableNumber(row.huidige_curatie_lng),
      resolutionLevel:
        normalizeResolution(toTrimmedString(row.huidige_curatie_resolution_level)) || 'broader',
    }),
    buildCandidateLocation({
      label: toTrimmedString(row.beste_beschikbare_locatie_label),
      qid: toTrimmedString(row.beste_beschikbare_locatie_qid),
      lat: toNullableNumber(row.beste_beschikbare_locatie_lat),
      lng: toNullableNumber(row.beste_beschikbare_locatie_lng),
      resolutionLevel:
        normalizeResolution(toTrimmedString(row.beste_beschikbare_locatie_resolution_level)) || 'broader',
    }),
    buildCandidateLocation({
      label: toTrimmedString(row.stm_gazetteer_suggestie_label),
      qid: toTrimmedString(row.stm_gazetteer_suggestie_qid),
      stmId: toTrimmedString(row.stm_gazetteer_suggestie_id),
      lat: toNullableNumber(row.stm_gazetteer_suggestie_lat),
      lng: toNullableNumber(row.stm_gazetteer_suggestie_lng),
      resolutionLevel: 'exact',
    }),
    buildCandidateLocation({
      label: toTrimmedString(row.voorgestelde_eindlabel),
      qid: toTrimmedString(row.voorgestelde_eind_qid),
      lat: toNullableNumber(row.voorgestelde_eind_lat),
      lng: toNullableNumber(row.voorgestelde_eind_lng),
      resolutionLevel:
        normalizeResolution(toTrimmedString(row.voorgestelde_eind_resolution_level)) || 'broader',
    }),
    buildCandidateLocation({
      label: toTrimmedString(row.thesaurus_match_label) || normalizeTerm(row),
      qid: toTrimmedString(row.thesaurus_wikidata_qid),
      wikidataUrl: toTrimmedString(row.thesaurus_wikidata_uri),
      lat: toNullableNumber(row.thesaurus_lat),
      lng: toNullableNumber(row.thesaurus_lng),
      resolutionLevel:
        normalizeResolution(toTrimmedString(row.thesaurus_resolution_level)) || 'broader',
    }),
  ].filter((candidate): candidate is WorkbookCandidateLocation => candidate !== null);

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = [candidate.stmId || '', candidate.qid || '', normalizeLocationKey(candidate.label)].join('::');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function candidateHasCoords(candidate: WorkbookCandidateLocation): boolean {
  return candidate.lat !== null && candidate.lng !== null;
}

function candidateMatchesInput(candidate: WorkbookCandidateLocation, input: string): boolean {
  const normalizedInput = normalizeLocationKey(input);
  const looseInput = makeLooseMatcherKey(input);
  const qidInput = normalizeWikidataReference(input).qid;

  const matchesLoose = (value: string | null | undefined): boolean => {
    if (!value || !looseInput) return false;
    return makeLooseMatcherKey(value) === looseInput;
  };

  return Boolean(
    normalizedInput && (
      normalizedInput === normalizeLocationKey(candidate.label) ||
      (candidate.stmId && normalizedInput === normalizeLocationKey(candidate.stmId)) ||
      (candidate.qid && normalizedInput === normalizeLocationKey(candidate.qid)) ||
      matchesLoose(candidate.label) ||
      matchesLoose(candidate.stmId) ||
      matchesLoose(candidate.qid) ||
      (qidInput && candidate.qid && qidInput === candidate.qid)
    ),
  );
}

function resolveCandidateFromGazetteer(input: string, gazetteer: StmGazetteerIndexes): WorkbookCandidateLocation | null {
  const normalizedInput = normalizeLocationKey(input);
  const qidInput = normalizeWikidataReference(input).qid;
  const resolved =
    gazetteer.byId.get(normalizedInput) ||
    (qidInput ? gazetteer.byQid.get(normalizeLocationKey(qidInput)) : undefined) ||
    gazetteer.byLabel.get(normalizedInput);

  if (!resolved) return null;

  return buildCandidateLocation({
    label: resolved.label,
    qid: resolved.qid,
    wikidataUrl: resolved.wikidataUrl,
    gazetteerUrl: resolved.gazetteerUrl,
    stmId: resolved.stmId,
    lat: resolved.lat,
    lng: resolved.lng,
    resolutionLevel: 'exact',
  });
}

function pickAcceptCandidate(row: EvaluationRow, gazetteer: StmGazetteerIndexes): CandidateLocation | null {
  const rawBestSuggestion = toTrimmedString(row.beste_locatiesuggestie);
  const bestSuggestion = normalizeReviewLocationInput(rawBestSuggestion);
  if (!bestSuggestion) return null;

  const candidates = buildWorkbookCandidates(row);
  const matchingCandidates = candidates.filter((candidate) =>
    candidateMatchesInput(candidate, bestSuggestion),
  );
  const matchWithCoords = matchingCandidates.find((candidate) =>
    candidateHasCoords(candidate),
  );
  if (matchWithCoords) return matchWithCoords;
  if (matchingCandidates[0]) return matchingCandidates[0];

  const gazetteerCandidate = resolveCandidateFromGazetteer(
    bestSuggestion,
    gazetteer,
  );
  if (gazetteerCandidate) return gazetteerCandidate;

  const rawGazetteerCandidate = resolveCandidateFromGazetteer(
    rawBestSuggestion,
    gazetteer,
  );
  if (rawGazetteerCandidate) return rawGazetteerCandidate;

  const fromRaw = extractDirectRefFromInput(rawBestSuggestion);
  if (fromRaw) return fromRaw;

  const fromNormalized = extractDirectRefFromInput(bestSuggestion);
  if (fromNormalized) return fromNormalized;

  return null;
}

function pickCustomCandidate(
  row: EvaluationRow,
  reviewLoc: string,
  gazetteer: StmGazetteerIndexes,
): CandidateLocation | null {
  const normalizedReviewLoc = normalizeReviewLocationInput(reviewLoc);
  const candidates = buildWorkbookCandidates(row);
  const matchingCandidates = candidates.filter((candidate) =>
    candidateMatchesInput(candidate, normalizedReviewLoc),
  );
  const matchWithCoords = matchingCandidates.find((candidate) => candidateHasCoords(candidate));
  if (matchWithCoords) return matchWithCoords;
  if (matchingCandidates[0]) return matchingCandidates[0];

  const gazetteerCandidate = resolveCandidateFromGazetteer(
    normalizedReviewLoc,
    gazetteer,
  );
  if (gazetteerCandidate) return gazetteerCandidate;

  const qidRef = normalizeWikidataReference(normalizedReviewLoc);
  const resolution =
    normalizeResolution(toTrimmedString(row.huidige_curatie_resolution_level)) ||
    normalizeResolution(toTrimmedString(row.beste_beschikbare_locatie_resolution_level)) ||
    'broader';

  // Resolve Wikidata coordinates if QID is recognized
  const wikiCoords = qidRef.qid ? resolveWikidataCoordinates(qidRef.qid) : null;

  return {
    label: normalizedReviewLoc,
    qid: qidRef.qid,
    wikidataUrl: qidRef.url,
    gazetteerUrl: null,
    lat: wikiCoords?.lat ?? null,
    lng: wikiCoords?.lng ?? null,
    resolutionLevel: resolution,
  };
}

function pickCandidateLocation(
  row: EvaluationRow,
  reviewStatus: ReviewStatus,
  reviewLoc: string,
  gazetteer: StmGazetteerIndexes,
): CandidateLocation | null {
  if (reviewStatus === 'reject' || reviewStatus === 'remove-broader') return null;
  
  const normalizedLoc = reviewLoc.toLowerCase();
  if (normalizedLoc === 's') return SURINAME_SHORTHAND;
  const isAccept = reviewStatus === 'accept';

  if (isAccept) {
    return pickAcceptCandidate(row, gazetteer);
  }

  return pickCustomCandidate(row, reviewLoc, gazetteer);
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
  const gazetteerIndexes = loadStmGazetteerIndexes();

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
    // Determine if we have specific locations in this group (not generic broader terms)
    // and they are either accepted, custom, or rejected with an explicit replacement.
    const hasSpecific = groupRows.some(row => {
        const term = normalizeTerm(row);
        const reviewLoc = toTrimmedString(row.ef_review_locatie);
        const remark = toTrimmedString(row.ef_review_opmerking).toLowerCase();
        if (remark.includes('niet-suriname')) return false;

        const status =
          normalizeReviewStatus(row.ef_review_status) ||
          deriveLegacyReviewStatus(reviewLoc);
        const isSpecific = !BROADER_TERMS.includes(term);
        const hasExplicitReplacement = status === 'reject' && Boolean(reviewLoc);
        return isSpecific && (status === 'accept' || status === 'custom' || hasExplicitReplacement);
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

      if (reviewStatus === 'remove-broader') {
          if (!hasSpecific) {
            summary.skippedUnmatched += 1;
            summary.errors += 1;
            summary.errorDetails.push(
              `Object ${objectnummer}, Term ${originalTerm}: remove-broader zonder specifieke tegenhanger in hetzelfde object.`,
            );
            continue;
          }
          evidenceSource = 'rejected';
          candidate = {
              label: originalTerm,
              qid: null,
              wikidataUrl: null,
              gazetteerUrl: null,
              lat: null,
              lng: null,
              resolutionLevel: 'broader'
          };
      } else if (reviewStatus === 'reject') {
          if (reviewLoc) {
            candidate = pickCustomCandidate(row, reviewLoc, gazetteerIndexes);
            if (!candidate) {
              summary.skippedUnmatched += 1;
              summary.errors += 1;
              summary.errorDetails.push(
                `Object ${objectnummer}, Term ${originalTerm}: reject met alternatief maar onresolveerbare ef_review_locatie "${reviewLoc}".`,
              );
              continue;
            }
          } else {
            // Explicitly reject this term when no acceptable Suriname replacement exists.
            evidenceSource = 'rejected';
            candidate = {
              label: originalTerm,
              qid: null,
              wikidataUrl: null,
              gazetteerUrl: null,
              lat: null,
              lng: null,
              resolutionLevel: 'broader',
            };
          }
      } else {
          candidate = pickCandidateLocation(
            row,
            reviewStatus || 'accept',
            reviewLoc || 'Y',
            gazetteerIndexes,
          );
      }

      if (!candidate) {
        if (reviewStatus === 'accept') {
          summary.skippedEmptyAccept += 1;
          summary.errors += 1;
          summary.errorDetails.push(
            `Object ${objectnummer}, Term ${originalTerm}: accept zonder resolvebare beste_locatiesuggestie.`,
          );
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
      const normalizedCandidate = applyStmFirstLocation(candidate);
      const normalizedWikidataQid =
        normalizeWikidataReference(normalizedCandidate.wikidataUrl || '').qid ||
        candidate.qid;

      const incoming: LocationEditRecord = {
        recordnummer,
        objectnummer,
        originalTerm,
        resolvedLocationLabel: normalizedCandidate.label,
        wikidataQid: normalizedWikidataQid,
        wikidataUrl: normalizedCandidate.wikidataUrl,
        gazetteerUrl: normalizedCandidate.gazetteerUrl,
        lat: normalizedCandidate.lat,
        lng: normalizedCandidate.lng,
        resolutionLevel: normalizedCandidate.resolutionLevel,
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
