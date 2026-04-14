import fs from 'fs';
import Papa from 'papaparse';
import path from 'path';
import * as XLSX from 'xlsx';

import {
  buildLatestLocationEditMap,
  inferResolutionLevel,
  loadLocationEdits,
  loadTermDefaults,
  normalizeWikidataReference,
  parseWktPoint,
} from '../lib/location-curation';
import type {
  LocationEditRecord,
  LocationResolutionLevel,
  TermDefault,
} from '../types/collection';

const DATA_DIR = path.join(process.cwd(), 'data');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');
const OBJECT_CSV_PATH = path.join(DATA_DIR, 'Suriname_objecten_export.csv');
const THESAURUS_PATH = path.join(
  DATA_DIR,
  'Geo-thesau-Suriname-TO-added_wiki_ids.csv',
);
const STREET_ALIASES_PATH = path.join(DATA_DIR, 'paramaribo-street-aliases.json');
const WIKIDATA_COMMONS_PATH = path.join(DATA_DIR, 'results_wikidata_commons.csv');
const STM_GAZETTEER_LOCAL_PATH = path.join(DATA_DIR, 'places-gazetteer.jsonld');

const SOURCE_WEIGHTS = {
  title: 40,
  commons: 30,
  description: 20,
} as const;

const PARAMARIBO_HINTS = ['paramaribo', 'suriname'];
const STREET_SUGGESTION_LIMIT = 3;

type ObjectCsvRow = {
  recordnummer: string;
  objectnummer: string;
  titel: string;
  beschrijving: string;
  vervaardiger: string;
  'datering.datum.start': string;
  'datering.datum.eind': string;
  objectnaam: string;
  materiaal: string;
  classificatiecode: string;
  'inhoud.classificatie.code': string;
  geografisch_trefwoord: string;
  'inhoud.hoofdmotief.algemeen': string;
  'inhoud.hoofdmotief.specifiek': string;
  'inhoud.onderwerp': string;
  'inhoud.persoon.naam': string;
  'PID_data.URI': string;
  'PID_werk.URI': string;
};

type StreetAliasEntry = {
  label: string;
  aliases: string[];
  wikidataQid: string | null;
};

type StreetSuggestionSource = keyof typeof SOURCE_WEIGHTS;

type StreetSuggestion = {
  label: string;
  matchedVariant: string;
  source: StreetSuggestionSource;
  snippet: string;
  wikidataQid: string | null;
  score: number;
};

type StmPlaceName = {
  text?: string;
  isPreferred?: boolean;
};

type StmGazetteerRawPlace = {
  id?: string;
  type?: string;
  wikidataQid?: string | null;
  location?: {
    lat?: number | null;
    lng?: number | null;
  } | null;
  names?: StmPlaceName[];
};

type StmGazetteerPlace = {
  id: string;
  label: string;
  aliases: string[];
  type: string;
  wikidataQid: string | null;
  lat: number | null;
  lng: number | null;
};

type StmGazetteerSuggestion = {
  stmId: string;
  label: string;
  matchedVariant: string;
  source: StreetSuggestionSource;
  snippet: string;
  wikidataQid: string | null;
  lat: number | null;
  lng: number | null;
  score: number;
};

type GeoThesaurusEntry = {
  term: string;
  matchedLabel: string | null;
  broaderTerm: string | null;
  wikidataUri: string | null;
  wikidataQid: string | null;
  broaderWikidataQid: string | null;
  gettyUri: string | null;
  geonamesUri: string | null;
  lat: number | null;
  lng: number | null;
  coordsWkt: string | null;
  resolutionLevel: LocationResolutionLevel | null;
  enrichmentStatus: 'none' | 'wikidata' | 'coords' | 'wikidata+coords';
  matchType: 'exact' | 'broader' | 'none';
};

type WikimediaEntry = {
  wikidataUrl: string | null;
  wikimediaUrl: string | null;
};

type ActiveLocationSource =
  | 'object-edit'
  | 'term-default'
  | 'thesaurus'
  | 'street-suggestion'
  | 'stm-gazetteer-suggestion'
  | 'none';

type ActiveLocation = {
  source: ActiveLocationSource;
  label: string | null;
  qid: string | null;
  wikidataUrl: string | null;
  lat: number | null;
  lng: number | null;
  resolutionLevel: LocationResolutionLevel | null;
  author: string;
  timestamp: string;
  remark: string;
};

type EvaluationRow = {
  titel: string;
  beschrijving: string;
  geografisch_trefwoord: string;
  beste_locatiesuggestie: string;
  ef_review_locatie: string;
  ef_review_opmerking: string;
  locatiekwaliteit_score: number;
  locatiekwaliteit: string;
  recordnummer: number;
  objectnummer: string;
  vervaardiger: string;
  datering_start: string;
  datering_eind: string;
  objectnaam: string;
  materiaal: string;
  rijksmuseum_geografisch_trefwoord_volledig: string;
  rijksmuseum_geografisch_trefwoord_atomair: string;
  term_index: number;
  term_totaal: number;
  thesaurus_match_label: string;
  thesaurus_broader_term: string;
  thesaurus_wikidata_qid: string;
  thesaurus_wikidata_uri: string;
  thesaurus_getty_uri: string;
  thesaurus_geonames_uri: string;
  thesaurus_lat: number | '';
  thesaurus_lng: number | '';
  thesaurus_resolution_level: string;
  thesaurus_match_type: string;
  stm_bestaande_verrijking: 'ja' | 'nee';
  stm_bestaande_verrijking_velden: string;
  stm_bestaande_verrijking_bron: string;
  huidige_curatie_bron: string;
  huidige_curatie_label: string;
  huidige_curatie_qid: string;
  huidige_curatie_wikidata_uri: string;
  huidige_curatie_lat: number | '';
  huidige_curatie_lng: number | '';
  huidige_curatie_resolution_level: string;
  huidige_curatie_auteur: string;
  huidige_curatie_timestamp: string;
  huidige_curatie_opmerking: string;
  beste_beschikbare_locatie_bron: string;
  beste_beschikbare_locatie_label: string;
  beste_beschikbare_locatie_qid: string;
  beste_beschikbare_locatie_lat: number | '';
  beste_beschikbare_locatie_lng: number | '';
  beste_beschikbare_locatie_resolution_level: string;
  straat_suggestie_aantal: number;
  straat_suggestie_top_label: string;
  straat_suggestie_top_qid: string;
  straat_suggestie_top_bronveld: string;
  straat_suggestie_top_score: number | '';
  straat_suggestie_top_snippet: string;
  stm_gazetteer_suggestie_id: string;
  stm_gazetteer_suggestie_label: string;
  stm_gazetteer_suggestie_qid: string;
  stm_gazetteer_suggestie_lat: number | '';
  stm_gazetteer_suggestie_lng: number | '';
  stm_gazetteer_suggestie_bronveld: string;
  stm_gazetteer_suggestie_score: number | '';
  stm_gazetteer_suggestie_snippet: string;
  beoordelingsreden: string;
  verbetermogelijkheid: string;
  aanbevolen_actie: string;
  voorgestelde_eindlabel: string;
  voorgestelde_eind_qid: string;
  voorgestelde_eind_lat: string;
  voorgestelde_eind_lng: string;
  voorgestelde_eind_resolution_level: string;
  wijziging_tov_rijksmuseum: string;
  wijziging_tov_bestaande_stm: string;
  wikimedia_url: string;
  pid_data_uri: string;
  pid_werk_uri: string;
};

type StreetSuggestionRow = {
  recordnummer: number;
  objectnummer: string;
  titel: string;
  rijksmuseum_geografisch_trefwoord_volledig: string;
  straat_label: string;
  straat_wikidata_qid: string;
  matched_variant: string;
  bronveld: string;
  score: number;
  snippet: string;
  wikimedia_url: string;
};

type ExistingEfReview = {
  efReviewLocatie: string;
  efReviewOpmerking: string;
};

type SummaryRow = {
  metric: string;
  value: number | string;
};

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

function buildDefaultOutputPath() {
  const stamp = new Date().toISOString().slice(0, 10);
  return path.join(REPORTS_DIR, `location-evaluation-${stamp}.xlsx`);
}

function splitMultiValue(value: string): string[] {
  if (!value || value === '""') return [];
  return value
    .split('$')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeMatcherText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[-./_,:;()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractCommonsText(url: string | null): string {
  if (!url) return '';

  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

function buildSuggestionSnippet(text: string, variant: string): string {
  const match = text.match(new RegExp(escapeRegExp(variant), 'i'));
  if (!match || match.index === undefined) {
    return variant;
  }

  const start = Math.max(0, match.index - 60);
  const end = Math.min(text.length, match.index + match[0].length + 60);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';

  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function loadObjectRows(): ObjectCsvRow[] {
  const csvContent = fs.readFileSync(OBJECT_CSV_PATH, 'utf-8');
  const parsed = Papa.parse<ObjectCsvRow>(csvContent, {
    header: true,
    delimiter: ';',
    skipEmptyLines: true,
  });

  return parsed.data;
}

function loadStreetAliases(): StreetAliasEntry[] {
  const raw = fs.readFileSync(STREET_ALIASES_PATH, 'utf-8');
  return JSON.parse(raw) as StreetAliasEntry[];
}

function loadStmGazetteerPlaces(): StmGazetteerPlace[] {
  if (!fs.existsSync(STM_GAZETTEER_LOCAL_PATH)) {
    return [];
  }

  const raw = fs.readFileSync(STM_GAZETTEER_LOCAL_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as { '@graph'?: StmGazetteerRawPlace[] };
  const graph = parsed['@graph'] || [];

  const places: StmGazetteerPlace[] = [];

  for (const row of graph) {
    const id = (row.id || '').trim();
    if (!id) continue;

    const names = Array.isArray(row.names) ? row.names : [];
    const preferred = names.find((name) => name.isPreferred && (name.text || '').trim());
    const fallback = names.find((name) => (name.text || '').trim());
    const label = (preferred?.text || fallback?.text || '').trim();
    if (!label) continue;

    const aliases = names
      .map((name) => (name.text || '').trim())
      .filter(Boolean)
      .filter((name) => name.toLowerCase() !== label.toLowerCase());

    places.push({
      id,
      label,
      aliases: Array.from(new Set(aliases)),
      type: (row.type || '').trim(),
      wikidataQid: (row.wikidataQid || '').trim() || null,
      lat: row.location?.lat ?? null,
      lng: row.location?.lng ?? null,
    });
  }

  return places;
}

function getStmGazetteerSuggestions(
  row: ObjectCsvRow,
  wikimediaUrl: string | null,
  places: StmGazetteerPlace[],
  terms: string[],
  thesaurusMatches: GeoThesaurusEntry[],
): StmGazetteerSuggestion[] {
  const existingTerms = new Set(
    [
      ...terms,
      ...thesaurusMatches.flatMap((entry) => [entry.term, entry.matchedLabel || '']),
    ]
      .map((value) => normalizeMatcherText(value))
      .filter(Boolean),
  );

  const sources = getStreetSearchSources(row, wikimediaUrl).map((entry) => ({
    ...entry,
    normalized: normalizeMatcherText(entry.text),
  }));

  const bestByStmId = new Map<string, StmGazetteerSuggestion>();

  for (const place of places) {
    const normalizedLabel = normalizeMatcherText(place.label);
    if (!normalizedLabel || existingTerms.has(normalizedLabel)) continue;

    const variants = [place.label, ...place.aliases].filter(Boolean);
    for (const variant of variants) {
      const normalizedVariant = normalizeMatcherText(variant);
      if (!normalizedVariant || normalizedVariant.length < 7) continue;

      const pattern = new RegExp(`(^|\\b)${escapeRegExp(normalizedVariant)}(\\b|$)`, 'i');

      for (const source of sources) {
        if (!pattern.test(source.normalized)) continue;

        const candidate: StmGazetteerSuggestion = {
          stmId: place.id,
          label: place.label,
          matchedVariant: variant,
          source: source.source,
          snippet: buildSuggestionSnippet(source.text, variant),
          wikidataQid: place.wikidataQid,
          lat: place.lat,
          lng: place.lng,
          score:
            SOURCE_WEIGHTS[source.source] +
            Math.min(normalizedVariant.length, 20) +
            (variant === place.label ? 8 : 0) +
            (place.type === 'plantation' ? 4 : 0),
        };

        const current = bestByStmId.get(place.id);
        if (!current || candidate.score > current.score) {
          bestByStmId.set(place.id, candidate);
        }
      }
    }
  }

  return Array.from(bestByStmId.values())
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, STREET_SUGGESTION_LIMIT);
}

function getReviewKey(recordnummer: number, term: string) {
  return `${recordnummer}::${term.trim().toLowerCase()}`;
}

function loadExistingEfReviewMap(outputPath: string): Map<string, ExistingEfReview> {
  const reviewMap = new Map<string, ExistingEfReview>();
  if (!fs.existsSync(outputPath)) return reviewMap;

  try {
    const workbook = XLSX.readFile(outputPath);
    const sheet = workbook.Sheets.Evaluatie;
    if (!sheet) return reviewMap;

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    for (const row of rows) {
      const recordnummer = Number.parseInt(String(row.recordnummer || ''), 10);
      const term = String(
        row.geografisch_trefwoord || row.rijksmuseum_geografisch_trefwoord_atomair || '',
      ).trim();
      if (!Number.isFinite(recordnummer) || !term) continue;

      const reviewLoc = String(row.ef_review_locatie || '').trim();
      const reviewNote = String(row.ef_review_opmerking || '').trim();
      if (!reviewLoc && !reviewNote) continue;

      reviewMap.set(getReviewKey(recordnummer, term), {
        efReviewLocatie: reviewLoc,
        efReviewOpmerking: reviewNote,
      });
    }
  } catch {
    return reviewMap;
  }

  return reviewMap;
}

function loadWikimediaEntries(): Map<string, WikimediaEntry> {
  const map = new Map<string, WikimediaEntry>();

  if (!fs.existsSync(WIKIDATA_COMMONS_PATH)) {
    return map;
  }

  const csvContent = fs.readFileSync(WIKIDATA_COMMONS_PATH, 'utf-8');
  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  for (const row of parsed.data) {
    const recordnummer = (row.recordnummer || '').trim();
    if (!recordnummer) continue;

    map.set(recordnummer, {
      wikidataUrl: (row.wikidata_url || '').trim() || null,
      wikimediaUrl: (row.wikimedia_url || '').trim() || null,
    });
  }

  return map;
}

function loadEnrichedGeoThesaurus(): Map<string, GeoThesaurusEntry> {
  const map = new Map<string, GeoThesaurusEntry>();
  const raw = fs.readFileSync(THESAURUS_PATH);
  const csvContent = new TextDecoder('latin1').decode(raw);
  const parsed = Papa.parse<string[]>(csvContent, {
    header: false,
    delimiter: ';',
    skipEmptyLines: true,
  });

  for (let index = 1; index < parsed.data.length; index += 1) {
    const cols = parsed.data[index];
    const term = (cols[1] || '').trim();
    if (!term) continue;

    const matchedLabel = (cols[2] || '').trim() || null;
    const broaderTerm = (cols[4] || '').trim() || null;
    const uriCandidates = [cols[5], cols[6], cols[7], cols[8]]
      .map((value) => (value || '').trim())
      .filter(Boolean);

    let wikidataUri: string | null = null;
    let gettyUri: string | null = null;
    let geonamesUri: string | null = null;

    for (const uri of uriCandidates) {
      if (uri.includes('wikidata.org')) wikidataUri = uri;
      else if (uri.includes('vocab.getty.edu')) gettyUri = uri;
      else if (uri.includes('geonames.org')) geonamesUri = uri;
    }

    const directQid = (cols[9] || '').trim();
    const broaderQid = (cols[10] || '').trim();
    const qidRef = normalizeWikidataReference(directQid || broaderQid);
    if (!wikidataUri && qidRef.url) {
      wikidataUri = qidRef.url;
    }

    const point = parseWktPoint((cols[12] || '').trim());
    const lat = point?.lat ?? null;
    const lng = point?.lng ?? null;
    const hasWikidata = Boolean(wikidataUri || directQid);
    const hasCoords = lat !== null && lng !== null;

    map.set(term, {
      term,
      matchedLabel,
      broaderTerm,
      wikidataUri,
      wikidataQid: directQid || qidRef.qid,
      broaderWikidataQid: broaderQid || null,
      gettyUri,
      geonamesUri,
      lat,
      lng,
      coordsWkt: (cols[12] || '').trim() || null,
      resolutionLevel: inferResolutionLevel(broaderTerm, hasWikidata),
      enrichmentStatus: hasWikidata && hasCoords
        ? 'wikidata+coords'
        : hasWikidata
          ? 'wikidata'
          : hasCoords
            ? 'coords'
            : 'none',
      matchType: hasWikidata ? 'exact' : broaderTerm ? 'broader' : 'none',
    });
  }

  return map;
}

function getEditKey(recordnummer: number, term: string): string {
  return `${recordnummer}::${term.trim().toLowerCase()}`;
}

function getStreetSearchSources(
  row: ObjectCsvRow,
  wikimediaUrl: string | null,
): Array<{ source: StreetSuggestionSource; text: string }> {
  const entries: Array<{ source: StreetSuggestionSource; text: string }> = [
    { source: 'title', text: row.titel || '' },
    { source: 'description', text: row.beschrijving || '' },
    { source: 'commons', text: extractCommonsText(wikimediaUrl) },
  ];

  return entries.filter((entry) => entry.text.trim());
}

function hasParamariboContext(
  row: ObjectCsvRow,
  thesaurusMatches: GeoThesaurusEntry[],
): boolean {
  const values = [
    row.geografisch_trefwoord,
    row.titel,
    row.beschrijving,
    ...thesaurusMatches.flatMap((entry) => [
      entry.term,
      entry.matchedLabel || '',
      entry.broaderTerm || '',
    ]),
  ];

  return values.some((value) => {
    const normalized = normalizeMatcherText(value);
    return PARAMARIBO_HINTS.some((hint) => normalized.includes(hint));
  });
}

function getStreetSuggestions(
  row: ObjectCsvRow,
  wikimediaUrl: string | null,
  aliases: StreetAliasEntry[],
  terms: string[],
  thesaurusMatches: GeoThesaurusEntry[],
): StreetSuggestion[] {
  if (!hasParamariboContext(row, thesaurusMatches)) {
    return [];
  }

  const existingTerms = new Set(
    [
      ...terms,
      ...thesaurusMatches.flatMap((entry) => [entry.term, entry.matchedLabel || '']),
    ]
      .map((value) => normalizeMatcherText(value))
      .filter(Boolean),
  );

  const sources = getStreetSearchSources(row, wikimediaUrl).map((entry) => ({
    ...entry,
    normalized: normalizeMatcherText(entry.text),
  }));

  const bestByLabel = new Map<string, StreetSuggestion>();

  for (const aliasEntry of aliases) {
    const normalizedLabel = normalizeMatcherText(aliasEntry.label);
    if (!normalizedLabel || existingTerms.has(normalizedLabel)) continue;

    const variants = [aliasEntry.label, ...aliasEntry.aliases].filter(Boolean);

    for (const variant of variants) {
      const normalizedVariant = normalizeMatcherText(variant);
      if (!normalizedVariant || normalizedVariant.length < 8) continue;

      const pattern = new RegExp(
        `(^|\\b)${escapeRegExp(normalizedVariant)}(\\b|$)`,
        'i',
      );

      for (const sourceEntry of sources) {
        if (!pattern.test(sourceEntry.normalized)) continue;

        const candidate: StreetSuggestion = {
          label: aliasEntry.label,
          matchedVariant: variant,
          source: sourceEntry.source,
          snippet: buildSuggestionSnippet(sourceEntry.text, variant),
          wikidataQid: aliasEntry.wikidataQid,
          score:
            SOURCE_WEIGHTS[sourceEntry.source] +
            Math.min(normalizedVariant.length, 20) +
            (variant === aliasEntry.label ? 6 : 0),
        };

        const current = bestByLabel.get(aliasEntry.label);
        if (!current || candidate.score > current.score) {
          bestByLabel.set(aliasEntry.label, candidate);
        }
      }
    }
  }

  return Array.from(bestByLabel.values())
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, STREET_SUGGESTION_LIMIT);
}

function getActiveLocation(
  recordnummer: number,
  term: string,
  latestEdits: Map<string, LocationEditRecord>,
  termDefaults: Map<string, TermDefault>,
  thesaurusEntry: GeoThesaurusEntry | undefined,
  topStreetSuggestion: StreetSuggestion | undefined,
  topStmGazetteerSuggestion: StmGazetteerSuggestion | undefined,
): ActiveLocation {
  const edit = latestEdits.get(getEditKey(recordnummer, term));
  if (edit && edit.evidenceSource !== 'revert') {
    return {
      source: 'object-edit',
      label: edit.resolvedLocationLabel,
      qid: edit.wikidataQid,
      wikidataUrl: edit.wikidataUrl,
      lat: edit.lat,
      lng: edit.lng,
      resolutionLevel: edit.resolutionLevel,
      author: edit.author,
      timestamp: edit.timestamp,
      remark: edit.remark || '',
    };
  }

  const termDefault = termDefaults.get(term.trim().toLowerCase());
  if (termDefault) {
    return {
      source: 'term-default',
      label: termDefault.resolvedLocationLabel,
      qid: termDefault.wikidataQid,
      wikidataUrl: termDefault.wikidataUrl,
      lat: termDefault.lat,
      lng: termDefault.lng,
      resolutionLevel: termDefault.resolutionLevel,
      author: termDefault.author,
      timestamp: termDefault.timestamp,
      remark: '',
    };
  }

  if (thesaurusEntry) {
    return {
      source: 'thesaurus',
      label: thesaurusEntry.matchedLabel || thesaurusEntry.term,
      qid: thesaurusEntry.wikidataQid,
      wikidataUrl: thesaurusEntry.wikidataUri,
      lat: thesaurusEntry.lat,
      lng: thesaurusEntry.lng,
      resolutionLevel: thesaurusEntry.resolutionLevel,
      author: '',
      timestamp: '',
      remark: '',
    };
  }

  if (topStreetSuggestion) {
    return {
      source: 'street-suggestion',
      label: topStreetSuggestion.label,
      qid: topStreetSuggestion.wikidataQid,
      wikidataUrl: topStreetSuggestion.wikidataQid
        ? `https://www.wikidata.org/entity/${topStreetSuggestion.wikidataQid}`
        : null,
      lat: null,
      lng: null,
      resolutionLevel: 'exact',
      author: '',
      timestamp: '',
      remark: topStreetSuggestion.snippet,
    };
  }

  if (topStmGazetteerSuggestion) {
    return {
      source: 'stm-gazetteer-suggestion',
      label: topStmGazetteerSuggestion.label,
      qid: topStmGazetteerSuggestion.wikidataQid,
      wikidataUrl: topStmGazetteerSuggestion.wikidataQid
        ? `https://www.wikidata.org/entity/${topStmGazetteerSuggestion.wikidataQid}`
        : null,
      lat: topStmGazetteerSuggestion.lat,
      lng: topStmGazetteerSuggestion.lng,
      resolutionLevel: 'exact',
      author: '',
      timestamp: '',
      remark: `${topStmGazetteerSuggestion.stmId} · ${topStmGazetteerSuggestion.snippet}`,
    };
  }

  return {
    source: 'none',
    label: null,
    qid: null,
    wikidataUrl: null,
    lat: null,
    lng: null,
    resolutionLevel: null,
    author: '',
    timestamp: '',
    remark: '',
  };
}

function getQualityAssessment(
  activeLocation: ActiveLocation,
  thesaurusEntry: GeoThesaurusEntry | undefined,
  topStreetSuggestion: StreetSuggestion | undefined,
  topStmGazetteerSuggestion: StmGazetteerSuggestion | undefined,
): {
  qualityLabel: string;
  score: number;
  reason: string;
  improvementOpportunity: string;
  recommendedAction: string;
} {
  const hasQid = Boolean(activeLocation.qid || activeLocation.wikidataUrl);
  const hasCoords =
    activeLocation.lat !== null && Number.isFinite(activeLocation.lat) &&
    activeLocation.lng !== null && Number.isFinite(activeLocation.lng);

  if (activeLocation.resolutionLevel === 'exact' && hasQid && hasCoords) {
    return {
      qualityLabel: 'A exact bekend',
      score: 95,
      reason: 'Exacte locatie met identifier en coordinaten beschikbaar.',
      improvementOpportunity: 'laag',
      recommendedAction: 'controleren en eventueel bevestigen',
    };
  }

  if (activeLocation.resolutionLevel === 'exact' && (hasQid || hasCoords)) {
    return {
      qualityLabel: 'B waarschijnlijk exact bekend',
      score: 85,
      reason: 'Exacte locatie lijkt bekend, maar identifiers of coordinaten zijn onvolledig.',
      improvementOpportunity: hasCoords ? 'wikidata-id toevoegen' : 'coordinaten toevoegen',
      recommendedAction: 'aanvullen en bevestigen',
    };
  }

  if (topStreetSuggestion && topStreetSuggestion.score >= 55) {
    return {
      qualityLabel: 'B waarschijnlijk exact bekend',
      score: Math.min(82, topStreetSuggestion.score + 10),
      reason: 'Sterke straatmatch gevonden in titel, beschrijving of Commons-bestandsnaam.',
      improvementOpportunity: 'straatmatch verifieren',
      recommendedAction: 'handmatig controleren en overnemen indien correct',
    };
  }

  if (topStmGazetteerSuggestion && topStmGazetteerSuggestion.score >= 55) {
    return {
      qualityLabel: 'B waarschijnlijk exact bekend',
      score: Math.min(88, topStmGazetteerSuggestion.score + 12),
      reason: 'Sterke match gevonden in STM gazetteer.',
      improvementOpportunity: 'stm-match verifieren',
      recommendedAction: 'controleer en koppel met STM-id',
    };
  }

  if (activeLocation.resolutionLevel === 'broader' && (hasQid || hasCoords)) {
    return {
      qualityLabel: 'C alleen bredere plaats bekend',
      score: 65,
      reason: 'Er is een gekoppelde bredere locatie, maar geen exacte afgebeelde plek.',
      improvementOpportunity: 'specifieker maken',
      recommendedAction: 'nadere plaats of straat zoeken',
    };
  }

  if (
    activeLocation.resolutionLevel === 'city' ||
    activeLocation.resolutionLevel === 'country'
  ) {
    return {
      qualityLabel: 'D alleen land of stad bekend',
      score: activeLocation.resolutionLevel === 'city' ? 48 : 35,
      reason: 'Alleen stads- of landniveau is beschikbaar.',
      improvementOpportunity: 'meer detail nodig',
      recommendedAction: 'lokalere plek zoeken in metadata of externe bron',
    };
  }

  if (thesaurusEntry || topStreetSuggestion) {
    return {
      qualityLabel: 'E onvoldoende onderbouwd',
      score: 20,
      reason: 'Er is wel een hint of term, maar de locatie is nog niet betrouwbaar vastgesteld.',
      improvementOpportunity: 'manual review nodig',
      recommendedAction: 'inhoudelijk beoordelen',
    };
  }

  return {
    qualityLabel: 'F geen bruikbare locatie',
    score: 0,
    reason: 'Geen bruikbare locatiekoppeling of kandidaat gevonden.',
    improvementOpportunity: 'onderzoek nodig',
    recommendedAction: 'geen automatische suggestie beschikbaar',
  };
}

function describeEnrichmentStatus(entry: GeoThesaurusEntry | undefined): string {
  if (!entry || entry.enrichmentStatus === 'none') return 'geen';
  if (entry.enrichmentStatus === 'wikidata+coords') return 'wikidata+coords';
  if (entry.enrichmentStatus === 'wikidata') return 'wikidata';
  return 'coords';
}

function getChangeAgainstRijksmuseum(
  term: string,
  activeLocation: ActiveLocation,
  thesaurusEntry: GeoThesaurusEntry | undefined,
): string {
  const normalizedOriginal = normalizeMatcherText(term);
  const normalizedActive = normalizeMatcherText(activeLocation.label || '');

  if (activeLocation.source === 'none') {
    return 'geen';
  }

  if (normalizedOriginal && normalizedOriginal === normalizedActive) {
    if (activeLocation.qid || activeLocation.lat !== null || activeLocation.lng !== null) {
      return 'zelfde term, identifiers/coordinaten toegevoegd';
    }
    return 'geen zichtbare wijziging';
  }

  if (thesaurusEntry && normalizeMatcherText(thesaurusEntry.term) === normalizedOriginal) {
    return 'zelfde trefwoord, verrijkt of aangescherpt';
  }

  return 'andere of specifiekere plaats voorgesteld';
}

function getChangeAgainstExistingStm(
  activeLocation: ActiveLocation,
  thesaurusEntry: GeoThesaurusEntry | undefined,
  topStreetSuggestion: StreetSuggestion | undefined,
): string {
  if (activeLocation.source === 'object-edit') return 'objectspecifieke curatie toegevoegd';
  if (activeLocation.source === 'term-default') return 'term-default toegevoegd';
  if (activeLocation.source === 'thesaurus' && thesaurusEntry) return 'reeds aanwezig in thesaurusverrijking';
  if (activeLocation.source === 'street-suggestion' && topStreetSuggestion) return 'nieuwe straatsuggestie nog niet bevestigd';
  if (activeLocation.source === 'stm-gazetteer-suggestion') return 'nieuwe STM-gazetteersuggestie nog niet bevestigd';
  return 'geen bestaande stm-verrijking';
}

function formatBestLocationSuggestion(activeLocation: ActiveLocation): string {
  if (activeLocation.source === 'none' || !activeLocation.label) {
    return '';
  }

  const details: string[] = [activeLocation.label];
  if (activeLocation.qid) details.push(activeLocation.qid);
  if (activeLocation.lat !== null && activeLocation.lng !== null) {
    details.push(`${activeLocation.lat}, ${activeLocation.lng}`);
  }

  return `${details.join(' | ')} [${activeLocation.source}]`;
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
      wch: Math.min(Math.max(maxValueLength + 2, 10), 48),
    };
  });
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 } as any;
  if (sheet['!ref']) {
    sheet['!autofilter'] = { ref: sheet['!ref'] };
  }
}

function makeWorksheet(rows: Array<Record<string, unknown>>): XLSX.WorkSheet {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  autosizeColumns(worksheet, rows);
  return worksheet;
}

function makeEvaluatieWorksheet(rows: EvaluationRow[]): XLSX.WorkSheet {
  const worksheet = makeWorksheet(rows as unknown as Array<Record<string, unknown>>);
  rows.forEach((row, i) => {
    if (!row.pid_werk_uri) return;
    const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: 0 }); // r=0 is header row
    worksheet[cellRef] = { t: 's', v: row.titel, l: { Target: row.pid_werk_uri } };
  });
  return worksheet;
}

function main() {
  ensureReportsDir();

  const outputPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : buildDefaultOutputPath();

  const objectRows = loadObjectRows();
  const geoThesaurus = loadEnrichedGeoThesaurus();
  const streetAliases = loadStreetAliases();
  const stmGazetteerPlaces = loadStmGazetteerPlaces();
  const wikimediaEntries = loadWikimediaEntries();
  const latestEdits = buildLatestLocationEditMap(loadLocationEdits());
  const termDefaults = loadTermDefaults();
  const existingReviewMap = loadExistingEfReviewMap(outputPath);

  const evaluationRows: EvaluationRow[] = [];
  const streetSuggestionRows: StreetSuggestionRow[] = [];

  for (const row of objectRows) {
    const recordnummer = Number.parseInt(row.recordnummer, 10);
    const terms = splitMultiValue(row.geografisch_trefwoord);
    const effectiveTerms = terms.length > 0 ? terms : [''];
    const wikimediaEntry = wikimediaEntries.get(row.recordnummer);
    const thesaurusMatches = effectiveTerms
      .map((term) => geoThesaurus.get(term))
      .filter((entry): entry is GeoThesaurusEntry => Boolean(entry));
    const streetSuggestions = getStreetSuggestions(
      row,
      wikimediaEntry?.wikimediaUrl || null,
      streetAliases,
      effectiveTerms,
      thesaurusMatches,
    );
    const stmGazetteerSuggestions = getStmGazetteerSuggestions(
      row,
      wikimediaEntry?.wikimediaUrl || null,
      stmGazetteerPlaces,
      effectiveTerms,
      thesaurusMatches,
    );
    const topStreetSuggestion = streetSuggestions[0];
    const topStmGazetteerSuggestion = stmGazetteerSuggestions[0];

    for (const suggestion of streetSuggestions) {
      streetSuggestionRows.push({
        recordnummer,
        objectnummer: row.objectnummer,
        titel: row.titel,
        rijksmuseum_geografisch_trefwoord_volledig: row.geografisch_trefwoord,
        straat_label: suggestion.label,
        straat_wikidata_qid: suggestion.wikidataQid || '',
        matched_variant: suggestion.matchedVariant,
        bronveld: suggestion.source,
        score: suggestion.score,
        snippet: suggestion.snippet,
        wikimedia_url: wikimediaEntry?.wikimediaUrl || '',
      });
    }

    effectiveTerms.forEach((term, index) => {
      const thesaurusEntry = term ? geoThesaurus.get(term) : undefined;
      const activeLocation = getActiveLocation(
        recordnummer,
        term,
        latestEdits,
        termDefaults,
        thesaurusEntry,
        topStreetSuggestion,
        topStmGazetteerSuggestion,
      );
      const quality = getQualityAssessment(
        activeLocation,
        thesaurusEntry,
        topStreetSuggestion,
        topStmGazetteerSuggestion,
      );
      const hasThesaurusEnrichment =
        Boolean(thesaurusEntry) && thesaurusEntry?.enrichmentStatus !== 'none';
      const bestSuggestion = formatBestLocationSuggestion(activeLocation);
      const existingReview = existingReviewMap.get(getReviewKey(recordnummer, term || row.geografisch_trefwoord));

      evaluationRows.push({
        titel: row.titel,
        beschrijving: row.beschrijving,
        geografisch_trefwoord: term || row.geografisch_trefwoord,
        beste_locatiesuggestie: bestSuggestion,
        ef_review_locatie: existingReview?.efReviewLocatie || '',
        ef_review_opmerking: existingReview?.efReviewOpmerking || '',
        locatiekwaliteit_score: quality.score,
        locatiekwaliteit: quality.qualityLabel,
        recordnummer,
        objectnummer: row.objectnummer,
        vervaardiger: row.vervaardiger,
        datering_start: row['datering.datum.start'],
        datering_eind: row['datering.datum.eind'],
        objectnaam: row.objectnaam,
        materiaal: row.materiaal,
        rijksmuseum_geografisch_trefwoord_volledig: row.geografisch_trefwoord,
        rijksmuseum_geografisch_trefwoord_atomair: term,
        term_index: index + 1,
        term_totaal: effectiveTerms.length,
        thesaurus_match_label: thesaurusEntry?.matchedLabel || '',
        thesaurus_broader_term: thesaurusEntry?.broaderTerm || '',
        thesaurus_wikidata_qid: thesaurusEntry?.wikidataQid || '',
        thesaurus_wikidata_uri: thesaurusEntry?.wikidataUri || '',
        thesaurus_getty_uri: thesaurusEntry?.gettyUri || '',
        thesaurus_geonames_uri: thesaurusEntry?.geonamesUri || '',
        thesaurus_lat: thesaurusEntry?.lat ?? '',
        thesaurus_lng: thesaurusEntry?.lng ?? '',
        thesaurus_resolution_level: thesaurusEntry?.resolutionLevel || '',
        thesaurus_match_type: thesaurusEntry?.matchType || '',
        stm_bestaande_verrijking: hasThesaurusEnrichment ? 'ja' : 'nee',
        stm_bestaande_verrijking_velden: describeEnrichmentStatus(thesaurusEntry),
        stm_bestaande_verrijking_bron: hasThesaurusEnrichment
          ? 'geo-thesaurus-enriched'
          : '',
        huidige_curatie_bron: activeLocation.source,
        huidige_curatie_label: activeLocation.source === 'thesaurus'
          ? ''
          : activeLocation.label || '',
        huidige_curatie_qid: activeLocation.source === 'thesaurus'
          ? ''
          : activeLocation.qid || '',
        huidige_curatie_wikidata_uri: activeLocation.source === 'thesaurus'
          ? ''
          : activeLocation.wikidataUrl || '',
        huidige_curatie_lat: activeLocation.source === 'thesaurus'
          ? ''
          : activeLocation.lat ?? '',
        huidige_curatie_lng: activeLocation.source === 'thesaurus'
          ? ''
          : activeLocation.lng ?? '',
        huidige_curatie_resolution_level: activeLocation.source === 'thesaurus'
          ? ''
          : activeLocation.resolutionLevel || '',
        huidige_curatie_auteur: activeLocation.source === 'object-edit' || activeLocation.source === 'term-default'
          ? activeLocation.author
          : '',
        huidige_curatie_timestamp: activeLocation.source === 'object-edit' || activeLocation.source === 'term-default'
          ? activeLocation.timestamp
          : '',
        huidige_curatie_opmerking: activeLocation.source === 'object-edit' || activeLocation.source === 'term-default'
          ? activeLocation.remark
          : '',
        beste_beschikbare_locatie_bron: activeLocation.source,
        beste_beschikbare_locatie_label: activeLocation.label || '',
        beste_beschikbare_locatie_qid: activeLocation.qid || '',
        beste_beschikbare_locatie_lat: activeLocation.lat ?? '',
        beste_beschikbare_locatie_lng: activeLocation.lng ?? '',
        beste_beschikbare_locatie_resolution_level: activeLocation.resolutionLevel || '',
        straat_suggestie_aantal: streetSuggestions.length,
        straat_suggestie_top_label: topStreetSuggestion?.label || '',
        straat_suggestie_top_qid: topStreetSuggestion?.wikidataQid || '',
        straat_suggestie_top_bronveld: topStreetSuggestion?.source || '',
        straat_suggestie_top_score: topStreetSuggestion?.score ?? '',
        straat_suggestie_top_snippet: topStreetSuggestion?.snippet || '',
        stm_gazetteer_suggestie_id: topStmGazetteerSuggestion?.stmId || '',
        stm_gazetteer_suggestie_label: topStmGazetteerSuggestion?.label || '',
        stm_gazetteer_suggestie_qid: topStmGazetteerSuggestion?.wikidataQid || '',
        stm_gazetteer_suggestie_lat: topStmGazetteerSuggestion?.lat ?? '',
        stm_gazetteer_suggestie_lng: topStmGazetteerSuggestion?.lng ?? '',
        stm_gazetteer_suggestie_bronveld: topStmGazetteerSuggestion?.source || '',
        stm_gazetteer_suggestie_score: topStmGazetteerSuggestion?.score ?? '',
        stm_gazetteer_suggestie_snippet: topStmGazetteerSuggestion?.snippet || '',
        beoordelingsreden: quality.reason,
        verbetermogelijkheid: quality.improvementOpportunity,
        aanbevolen_actie: quality.recommendedAction,
        voorgestelde_eindlabel: '',
        voorgestelde_eind_qid: '',
        voorgestelde_eind_lat: '',
        voorgestelde_eind_lng: '',
        voorgestelde_eind_resolution_level: '',
        wijziging_tov_rijksmuseum: getChangeAgainstRijksmuseum(
          term,
          activeLocation,
          thesaurusEntry,
        ),
        wijziging_tov_bestaande_stm: getChangeAgainstExistingStm(
          activeLocation,
          thesaurusEntry,
          topStreetSuggestion,
        ),
        wikimedia_url: wikimediaEntry?.wikimediaUrl || '',
        pid_data_uri: row['PID_data.URI'],
        pid_werk_uri: row['PID_werk.URI'],
      });
    });
  }

  const thesaurusRows = Array.from(geoThesaurus.values()).map((entry) => ({
    term: entry.term,
    matched_label: entry.matchedLabel || '',
    broader_term: entry.broaderTerm || '',
    wikidata_qid: entry.wikidataQid || '',
    broader_wikidata_qid: entry.broaderWikidataQid || '',
    wikidata_uri: entry.wikidataUri || '',
    getty_uri: entry.gettyUri || '',
    geonames_uri: entry.geonamesUri || '',
    coords_wkt: entry.coordsWkt || '',
    lat: entry.lat ?? '',
    lng: entry.lng ?? '',
    resolution_level: entry.resolutionLevel || '',
    enrichment_status: entry.enrichmentStatus,
    match_type: entry.matchType,
  }));

  const qualityCounts = evaluationRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.locatiekwaliteit] = (acc[row.locatiekwaliteit] || 0) + 1;
    return acc;
  }, {});

  const actionCounts = evaluationRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.aanbevolen_actie] = (acc[row.aanbevolen_actie] || 0) + 1;
    return acc;
  }, {});

  const summaryRows: SummaryRow[] = [
    { metric: 'objecten in broncsv', value: objectRows.length },
    { metric: 'rijen in evaluatietab', value: evaluationRows.length },
    { metric: 'objecten met straatsuggestie', value: new Set(streetSuggestionRows.map((row) => row.objectnummer)).size },
    { metric: 'totaal straatsuggesties', value: streetSuggestionRows.length },
    { metric: 'stm-gazetteer plaatsen geladen', value: stmGazetteerPlaces.length },
    { metric: 'rijen met stm-gazetteersuggestie', value: evaluationRows.filter((row) => row.stm_gazetteer_suggestie_id).length },
    { metric: 'overgenomen bestaande ef-reviews', value: evaluationRows.filter((row) => row.ef_review_locatie || row.ef_review_opmerking).length },
    { metric: 'thesaurustermen met verrijking', value: thesaurusRows.filter((row) => row.enrichment_status !== 'none').length },
  ];

  for (const [label, value] of Object.entries(qualityCounts).sort()) {
    summaryRows.push({ metric: `kwaliteit: ${label}`, value });
  }

  for (const [label, value] of Object.entries(actionCounts).sort()) {
    summaryRows.push({ metric: `aanbevolen actie: ${label}`, value });
  }

  const legendRows = [
    {
      veld: 'locatiekwaliteit',
      betekenis: 'Filterbare beoordeling van hoe goed de afgebeelde locatie nu bekend is.',
      waarden: 'A exact bekend | B waarschijnlijk exact bekend | C alleen bredere plaats bekend | D alleen land of stad bekend | E onvoldoende onderbouwd | F geen bruikbare locatie',
    },
    {
      veld: 'stm_bestaande_verrijking',
      betekenis: 'Geeft aan of Geo-thesau-Suriname-TO-added_wiki_ids al een verrijking bevat voor het trefwoord.',
      waarden: 'ja | nee',
    },
    {
      veld: 'huidige_curatie_bron',
      betekenis: 'Laat zien of er al objectspecifieke of term-brede curatie in de site aanwezig is.',
      waarden: 'object-edit | term-default | thesaurus | street-suggestion | none',
    },
    {
      veld: 'ef_review_locatie',
      betekenis: 'Enige verplichte reviewveld: zet Y als suggestie akkoord is, of typ hier direct je verbeterde locatie.',
      waarden: 'Y of vrije tekst (jouw verbeterde locatie)',
    },
    {
      veld: 'ef_review_opmerking',
      betekenis: 'Korte toelichting bij je keuze of correctie.',
      waarden: 'vrije tekst',
    },
    {
      veld: 'stm_gazetteer_suggestie_*',
      betekenis: 'Aanvullende suggestie vanuit STM places gazetteer (https://suriname-database-model.vercel.app/data/places-gazetteer.jsonld).',
      waarden: 'id/label/qid/lat/lng/bronveld/score/snippet',
    },
    {
      veld: 'voorgestelde_eindlabel / qid / lat / lng',
      betekenis: 'Kolommen voor de beoogde verbeterde metadata na review.',
      waarden: 'vrij invulbaar',
    },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, makeEvaluatieWorksheet(evaluationRows), 'Evaluatie');
  XLSX.utils.book_append_sheet(workbook, makeWorksheet(streetSuggestionRows), 'Straatsuggesties');
  XLSX.utils.book_append_sheet(workbook, makeWorksheet(thesaurusRows), 'Termbron');
  XLSX.utils.book_append_sheet(workbook, makeWorksheet(summaryRows), 'Samenvatting');
  XLSX.utils.book_append_sheet(workbook, makeWorksheet(legendRows), 'Legenda');

  XLSX.writeFile(workbook, outputPath);

  console.log(
    `Wrote location evaluation workbook with ${evaluationRows.length} evaluation rows to ${outputPath}`,
  );
}

main();