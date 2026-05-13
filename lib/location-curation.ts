import type {
  CollectionObject,
  GeoFlag,
  GeoKeywordDetail,
  LocationEditRecord,
  LocationResolutionLevel,
  TermDefault,
} from '@/types/collection';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const LOCATION_EDITS_PATH = path.join(DATA_DIR, 'location-edits.jsonl');
const TERM_DEFAULTS_PATH = path.join(DATA_DIR, 'term-wikidata-map.json');
const STM_GAZETTEER_PATH = path.join(DATA_DIR, 'places-gazetteer.jsonld');

type StmGazetteerName = {
  text?: string;
  isPreferred?: boolean;
};

type StmGazetteerPlace = {
  '@id'?: string;
  id?: string;
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
  gazetteerUrl: string;
  wikidataUrl: string | null;
  lat: number | null;
  lng: number | null;
};

type StmGazetteerIndex = {
  byId: Map<string, StmGazetteerResolvedPlace>;
  byQid: Map<string, StmGazetteerResolvedPlace>;
  byLabel: Map<string, StmGazetteerResolvedPlace | null>;
};

let stmGazetteerIndexCache: StmGazetteerIndex | null = null;

function normalizeLabelKey(input: string | null | undefined): string {
  return (input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const SURINAME_BOUNDS = {
  minLat: 1.7,
  maxLat: 6.3,
  minLng: -58.2,
  maxLng: -53.8,
};

export const NETHERLANDS_BOUNDS = {
  minLat: 50.7,
  maxLat: 53.6,
  minLng: 3.4,
  maxLng: 7.2,
};

// Hardcoded Wikidata coordinates for major places
// Q730 = Suriname, Q1307 = Paramaribo, etc.
const WIKIDATA_COORDINATES: Record<
  string,
  { lat: number; lng: number } | null
> = {
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

export function getGeoFlags(lat: number | null, lng: number | null): GeoFlag[] {
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

function normalizeStmId(input: string | null | undefined): string | null {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;
  const match = trimmed.match(/stm-[a-z0-9-]+/i);
  if (!match) return null;
  return match[0].toLowerCase();
}

function getStmGazetteerIndex(): StmGazetteerIndex {
  if (stmGazetteerIndexCache) return stmGazetteerIndexCache;

  const byId = new Map<string, StmGazetteerResolvedPlace>();
  const byQid = new Map<string, StmGazetteerResolvedPlace>();
  const byLabel = new Map<string, StmGazetteerResolvedPlace | null>();

  if (!fs.existsSync(STM_GAZETTEER_PATH)) {
    stmGazetteerIndexCache = { byId, byQid, byLabel };
    return stmGazetteerIndexCache;
  }

  try {
    const dataset = JSON.parse(
      fs.readFileSync(STM_GAZETTEER_PATH, 'utf-8'),
    ) as StmGazetteerDataset;
    for (const place of dataset['@graph'] || []) {
      const fromId = normalizeStmId(place.id);
      const fromUrl = normalizeStmId(place['@id']);
      const stmId = fromId || fromUrl;
      if (!stmId) continue;

      const qidRef = normalizeWikidataReference(
        (place.wikidataQid || '').trim(),
      );
      const resolved: StmGazetteerResolvedPlace = {
        stmId,
        gazetteerUrl: (
          place['@id'] || `https://data.suriname-timemachine.org/place/${stmId}`
        ).trim(),
        wikidataUrl: qidRef.url,
        lat: place.location?.lat ?? null,
        lng: place.location?.lng ?? null,
      };

      byId.set(stmId, resolved);
      if (qidRef.qid && !byQid.has(qidRef.qid)) {
        byQid.set(qidRef.qid, resolved);
      }

      for (const name of place.names || []) {
        const key = normalizeLabelKey(name.text || '');
        if (!key) continue;

        if (!byLabel.has(key)) {
          byLabel.set(key, resolved);
          continue;
        }

        const existing = byLabel.get(key);
        if (existing && existing.stmId !== resolved.stmId) {
          // Mark ambiguous labels as unusable for fallback.
          byLabel.set(key, null);
        }
      }
    }
  } catch {
    stmGazetteerIndexCache = {
      byId: new Map(),
      byQid: new Map(),
      byLabel: new Map(),
    };
    return stmGazetteerIndexCache;
  }

  stmGazetteerIndexCache = { byId, byQid, byLabel };
  return stmGazetteerIndexCache;
}

export function applyStmFirstLocation<
  T extends {
    wikidataUrl: string | null;
    gazetteerUrl: string | null;
    lat: number | null;
    lng: number | null;
    resolvedLocationLabel?: string | null;
    matchedLabel?: string | null;
  },
>(input: T): T {
  const index = getStmGazetteerIndex();
  const qid = normalizeWikidataReference(input.wikidataUrl || '').qid;
  const stmId = normalizeStmId(input.gazetteerUrl);
  const labelKey = normalizeLabelKey(
    input.resolvedLocationLabel || input.matchedLabel || '',
  );
  const labelResolved = labelKey ? (index.byLabel.get(labelKey) ?? null) : null;

  const resolved =
    (stmId ? index.byId.get(stmId) : undefined) ||
    (qid ? index.byQid.get(qid) : undefined) ||
    labelResolved ||
    null;

  const hasStmCoords =
    resolved !== null && resolved.lat !== null && resolved.lng !== null;

  return {
    ...input,
    wikidataUrl: input.wikidataUrl ?? resolved?.wikidataUrl ?? null,
    gazetteerUrl: input.gazetteerUrl ?? resolved?.gazetteerUrl ?? null,
    lat: hasStmCoords ? (resolved?.lat ?? null) : input.lat,
    lng: hasStmCoords ? (resolved?.lng ?? null) : input.lng,
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
    .map((detail): GeoKeywordDetail | null => {
      const edit = latestEdits.get(getEditKey(obj.recordnummer, detail.term));
      const normalizedBase = applyStmFirstLocation({
        wikidataUrl: detail.wikidataUri,
        gazetteerUrl: detail.stmGazetteerUrl ?? null,
        lat: detail.lat,
        lng: detail.lng,
        matchedLabel: detail.matchedLabel,
      });
      const baseFlags = getGeoFlags(normalizedBase.lat, normalizedBase.lng);

      // No edit OR an explicit revert: keep original detail metadata,
      // but refresh location fields from the STM-first normalized base.
      if (!edit || edit.evidenceSource === 'revert') {
        return {
          ...detail,
          wikidataUri: normalizedBase.wikidataUrl ?? detail.wikidataUri,
          stmGazetteerUrl:
            normalizedBase.gazetteerUrl ?? detail.stmGazetteerUrl ?? null,
          lat: normalizedBase.lat,
          lng: normalizedBase.lng,
          region: getRegionFromCoordinates(
            normalizedBase.lat,
            normalizedBase.lng,
          ),
          flags: Array.from(new Set([...(detail.flags || []), ...baseFlags])),
        };
      }

      if (edit.evidenceSource === 'rejected') {
        return null;
      }

      const normalizedEdit = applyStmFirstLocation(edit);

      return {
        ...detail,
        matchedLabel: edit.resolvedLocationLabel,
        wikidataUri: normalizedEdit.wikidataUrl ?? detail.wikidataUri,
        stmGazetteerUrl:
          normalizedEdit.gazetteerUrl ?? detail.stmGazetteerUrl ?? null,
        lat: normalizedEdit.lat,
        lng: normalizedEdit.lng,
        region: getRegionFromCoordinates(
          normalizedEdit.lat,
          normalizedEdit.lng,
        ),
        source: 'edit' as const,
        resolutionLevel: edit.resolutionLevel,
        flags: getGeoFlags(normalizedEdit.lat, normalizedEdit.lng),
        provenance: {
          author: edit.author,
          timestamp: edit.timestamp,
          remark: edit.remark,
        },
      };
    })
    .filter((d): d is GeoKeywordDetail => d !== null);

  return {
    ...obj,
    geoKeywordDetails: updatedDetails,
    geographicKeywords: updatedDetails.map((d) => d.term),
  };
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

    const normalizedDefault = applyStmFirstLocation(def);

    return {
      ...detail,
      matchedLabel: def.resolvedLocationLabel,
      wikidataUri: normalizedDefault.wikidataUrl ?? detail.wikidataUri,
      stmGazetteerUrl:
        normalizedDefault.gazetteerUrl ?? detail.stmGazetteerUrl ?? null,
      lat: normalizedDefault.lat,
      lng: normalizedDefault.lng,
      region: getRegionFromCoordinates(
        normalizedDefault.lat,
        normalizedDefault.lng,
      ),
      resolutionLevel: def.resolutionLevel,
      source: 'term-default' as const,
      flags: getGeoFlags(normalizedDefault.lat, normalizedDefault.lng),
      provenance: {
        author: def.author,
        timestamp: def.timestamp,
        remark: null,
      },
    } satisfies GeoKeywordDetail;
  });

  return { ...obj, geoKeywordDetails: updatedDetails };
}
