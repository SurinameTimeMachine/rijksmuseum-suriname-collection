import fs from 'fs';
import Papa from 'papaparse';
import path from 'path';

import type {
  CollectionObject,
  GeoFlag,
  GeoKeywordDetail,
  LocationEditRecord,
  LocationResolutionLevel,
  TermDefault,
} from '@/types/collection';

const DATA_DIR = path.join(process.cwd(), 'data');
const LOCATION_EDITS_PATH = path.join(DATA_DIR, 'location-edits.jsonl');
const COUNTRY_CODES_PATH = path.join(DATA_DIR, 'country_codes.csv');
const TERM_DEFAULTS_PATH = path.join(DATA_DIR, 'term-wikidata-map.json');

const SURINAME_BOUNDS = {
  minLat: 1.7,
  maxLat: 6.3,
  minLng: -58.2,
  maxLng: -53.8,
};

const NETHERLANDS_BOUNDS = {
  minLat: 50.7,
  maxLat: 53.6,
  minLng: 3.4,
  maxLng: 7.2,
};

// Hardcoded Wikidata coordinates for major places
// Q730 = Suriname, Q1307 = Paramaribo, etc.
const WIKIDATA_COORDINATES: Record<string, { lat: number; lng: number } | null> = {
  Q730: { lat: 4.310475921401273, lng: -55.38661673044588 }, // Suriname
  Q1307: { lat: 5.82392031098937, lng: -55.151778467090274 }, // Paramaribo
};

function getEditKey(recordnummer: number, term: string) {
  return `${recordnummer}::${term.trim().toLowerCase()}`;
}

export function isWithinSurinameBounds(lat: number, lng: number): boolean {
  return (
    lat >= SURINAME_BOUNDS.minLat &&
    lat <= SURINAME_BOUNDS.maxLat &&
    lng >= SURINAME_BOUNDS.minLng &&
    lng <= SURINAME_BOUNDS.maxLng
  );
}

export function getGeoFlags(
  lat: number | null,
  lng: number | null,
): GeoFlag[] {
  if (lat === null || lng === null) return [];
  return isWithinSurinameBounds(lat, lng) ? [] : ['outside-suriname'];
}

export function getRegionFromCoordinates(
  lat: number | null,
  lng: number | null,
): GeoKeywordDetail['region'] {
  if (lat === null || lng === null) return null;

  if (isWithinSurinameBounds(lat, lng)) return 'suriname';

  if (
    lat >= NETHERLANDS_BOUNDS.minLat &&
    lat <= NETHERLANDS_BOUNDS.maxLat &&
    lng >= NETHERLANDS_BOUNDS.minLng &&
    lng <= NETHERLANDS_BOUNDS.maxLng
  ) {
    return 'netherlands';
  }

  return 'other';
}

export function parseWktPoint(
  value: string | null | undefined,
): { lat: number; lng: number } | null {
  if (!value) return null;

  const match = value
    .trim()
    .match(/^Point\(([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)\)$/i);
  if (!match) return null;

  const lng = Number(match[1]);
  const lat = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
}

export function normalizeWikidataReference(input: string): {
  qid: string | null;
  url: string | null;
} {
  const trimmed = input.trim();
  if (!trimmed) return { qid: null, url: null };

  const qidMatch = trimmed.match(/Q\d+/i);
  const qid = qidMatch ? qidMatch[0].toUpperCase() : null;

  return {
    qid,
    url: qid ? `https://www.wikidata.org/entity/${qid}` : null,
  };
}

/**
 * Resolve Wikidata QID to coordinates if available in hardcoded map.
 * Returns null if QID not in map or coordinates not found.
 */
export function resolveWikidataCoordinates(
  qid: string | null,
): { lat: number; lng: number } | null {
  if (!qid) return null;
  return WIKIDATA_COORDINATES[qid] ?? null;
}

export function inferResolutionLevel(
  broaderTerm: string | null,
  hasDirectMatch: boolean,
): LocationResolutionLevel | null {
  if (hasDirectMatch) return 'exact';
  if (!broaderTerm) return null;

  const normalized = broaderTerm.toLowerCase();
  if (normalized.includes('paramaribo')) return 'city';
  if (normalized.includes('suriname')) return 'country';
  return 'broader';
}

export function loadLocationEdits(): LocationEditRecord[] {
  if (!fs.existsSync(LOCATION_EDITS_PATH)) return [];

  const raw = fs.readFileSync(LOCATION_EDITS_PATH, 'utf-8').trim();
  if (!raw) return [];

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as LocationEditRecord;
        return [parsed];
      } catch {
        return [];
      }
    });
}

export function appendLocationEdit(record: LocationEditRecord): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const payload = `${JSON.stringify(record)}\n`;
  fs.appendFileSync(LOCATION_EDITS_PATH, payload, 'utf-8');
}

export function buildLatestLocationEditMap(
  edits: LocationEditRecord[],
): Map<string, LocationEditRecord> {
  const latest = new Map<string, LocationEditRecord>();

  for (const edit of edits) {
    latest.set(getEditKey(edit.recordnummer, edit.originalTerm), edit);
  }

  return latest;
}

export function applyLocationEditsToObject(
  obj: CollectionObject,
  latestEdits: Map<string, LocationEditRecord>,
): CollectionObject {
  const updatedDetails = obj.geoKeywordDetails
    .map((detail) => {
      const edit = latestEdits.get(getEditKey(obj.recordnummer, detail.term));
      const baseFlags = getGeoFlags(detail.lat, detail.lng);

      if (!edit) {
        return {
          ...detail,
          flags: Array.from(new Set([...(detail.flags || []), ...baseFlags])),
        };
      }

      if (edit.evidenceSource === 'revert') {
        return {
          ...detail,
          flags: Array.from(new Set([...(detail.flags || []), ...baseFlags])),
        };
      }

      if (edit.evidenceSource === 'rejected') {
        return null;
      }

      return {
        ...detail,
        matchedLabel: edit.resolvedLocationLabel,
        wikidataUri: edit.wikidataUrl,
        stmGazetteerUrl: edit.gazetteerUrl ?? null,
        lat: edit.lat,
        lng: edit.lng,
        region: getRegionFromCoordinates(edit.lat, edit.lng),
        source: 'edit' as const,
        resolutionLevel: edit.resolutionLevel,
        flags: getGeoFlags(edit.lat, edit.lng),
        provenance: {
          author: edit.author,
          timestamp: edit.timestamp,
          remark: edit.remark,
        },
      } satisfies GeoKeywordDetail;
    })
    .filter((d): d is GeoKeywordDetail => d !== null);

  return {
    ...obj,
    geoKeywordDetails: updatedDetails,
    geographicKeywords: updatedDetails.map((d) => d.term),
  };
}

type CountryCodeRow = {
  geografisch_trefwoord?: string;
  Location?: string;
  Country?: string;
};

function addTerm(set: Set<string>, value: string | undefined) {
  if (!value) return;
  const trimmed = value.trim();
  if (!trimmed) return;
  set.add(trimmed.toLowerCase());
}

/**
 * Load location terms marked as SU from country_codes.csv.
 * Uses exact values only to avoid false positives from split composite terms.
 */
export function loadSurinameLocationTerms(): string[] {
  if (!fs.existsSync(COUNTRY_CODES_PATH)) return [];

  const csv = fs.readFileSync(COUNTRY_CODES_PATH, 'utf-8');
  const parsed = Papa.parse<CountryCodeRow>(csv, {
    header: true,
    delimiter: ';',
    skipEmptyLines: true,
  });

  const terms = new Set<string>();

  for (const row of parsed.data) {
    if ((row.Country || '').trim().toUpperCase() !== 'SU') continue;

    const raw = (row.geografisch_trefwoord || '').trim();
    if (raw) addTerm(terms, raw);

    addTerm(terms, row.Location);
  }

  return Array.from(terms.values());
}

export function loadTermDefaults(): Map<string, TermDefault> {
  if (!fs.existsSync(TERM_DEFAULTS_PATH)) return new Map();

  try {
    const raw = fs.readFileSync(TERM_DEFAULTS_PATH, 'utf-8').trim();
    if (!raw || raw === '{}') return new Map();
    const obj = JSON.parse(raw) as Record<string, TermDefault>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

export function saveTermDefault(entry: TermDefault): void {
  const existing = loadTermDefaults();
  const key = entry.term.trim().toLowerCase();
  existing.set(key, entry);

  const plain: Record<string, TermDefault> = {};
  for (const [k, v] of existing.entries()) {
    plain[k] = v;
  }

  fs.writeFileSync(TERM_DEFAULTS_PATH, JSON.stringify(plain, null, 2) + '\n', 'utf-8');
}

export function applyTermDefaultsToObject(
  obj: CollectionObject,
  termDefaults: Map<string, TermDefault>,
): CollectionObject {
  const updatedDetails = obj.geoKeywordDetails.map((detail) => {
    // Don't overwrite object-specific edits or already-confirmed details
    if (detail.source === 'edit') return detail;

    const key = detail.term.trim().toLowerCase();
    const def = termDefaults.get(key);
    if (!def) return detail;

    return {
      ...detail,
      matchedLabel: def.resolvedLocationLabel,
      wikidataUri: def.wikidataUrl,
      stmGazetteerUrl: def.gazetteerUrl ?? null,
      lat: def.lat,
      lng: def.lng,
      region: getRegionFromCoordinates(def.lat, def.lng),
      resolutionLevel: def.resolutionLevel,
      source: 'term-default' as const,
      flags: getGeoFlags(def.lat, def.lng),
      provenance: {
        author: def.author,
        timestamp: def.timestamp,
        remark: null,
      },
    } satisfies GeoKeywordDetail;
  });

  return { ...obj, geoKeywordDetails: updatedDetails };
}