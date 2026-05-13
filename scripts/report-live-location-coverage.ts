import fs from 'fs';
import path from 'path';

type Region = 'suriname' | 'netherlands' | 'other' | null;

type GeoKeywordDetail = {
  term: string;
  broaderTerm: string | null;
  lat: number | null;
  lng: number | null;
  region: Region;
  source: string;
};

type CollectionObject = {
  objectnummer: string;
  titles?: string[];
  geographicKeywords?: string[];
  geoKeywordDetails?: GeoKeywordDetail[];
};

type ProblemBucket =
  | 'no-geo-details'
  | 'unresolved-only'
  | 'thesaurus-no-coords'
  | 'mixed-no-coords';

const DATA_DIR = path.join(process.cwd(), 'data');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');
const COLLECTION_PATH = path.join(DATA_DIR, 'collection.json');

const SUMMARY_PATH = path.join(
  REPORTS_DIR,
  'live-location-coverage-summary.json',
);
const GENERIC_CASES_PATH = path.join(
  REPORTS_DIR,
  'live-location-generic-suriname-paramaribo.csv',
);
const PROBLEM_CASES_PATH = path.join(
  REPORTS_DIR,
  'live-location-problem-cases.csv',
);

const GENERIC_TERMS = new Set([
  'suriname',
  'suriname (zuid-amerika)',
  'paramaribo',
  'paramaribo (stad)',
]);

function toCsvCell(value: unknown): string {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsv(
  filePath: string,
  headers: string[],
  rows: Array<Array<unknown>>,
) {
  const lines = [headers.map(toCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(toCsvCell).join(','));
  }
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf-8');
}

function normalize(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function mapReady(details: GeoKeywordDetail[]): GeoKeywordDetail[] {
  return details.filter((detail) => detail?.lat != null && detail?.lng != null);
}

function isGenericMapReady(details: GeoKeywordDetail[]): boolean {
  return (
    details.length > 0 &&
    details.every((detail) => GENERIC_TERMS.has(normalize(detail.term)))
  );
}

function classifyProblem(details: GeoKeywordDetail[]): ProblemBucket {
  if (details.length === 0) return 'no-geo-details';
  if (details.every((detail) => detail.source === 'unresolved'))
    return 'unresolved-only';
  if (
    details.every(
      (detail) =>
        detail.source === 'thesaurus' &&
        detail.lat == null &&
        detail.lng == null,
    )
  ) {
    return 'thesaurus-no-coords';
  }
  return 'mixed-no-coords';
}

function main() {
  const collection = JSON.parse(
    fs.readFileSync(COLLECTION_PATH, 'utf-8'),
  ) as CollectionObject[];
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  let objectsWithGeoDetails = 0;
  let objectsMapReady = 0;
  let objectsNotMapReady = 0;
  let objectsOnlyGenericSurinameOrParamaribo = 0;
  let objectsWithSpecificMapReady = 0;
  let objectsMapReadyOnlyOutsideSuriname = 0;
  let objectsMapReadyMixedInsideOutside = 0;
  let objectsMapReadyOnlyInsideSuriname = 0;

  const problemBucketCounts: Record<ProblemBucket, number> = {
    'no-geo-details': 0,
    'unresolved-only': 0,
    'thesaurus-no-coords': 0,
    'mixed-no-coords': 0,
  };

  const genericRows: Array<Array<unknown>> = [];
  const problemRows: Array<Array<unknown>> = [];

  for (const obj of collection) {
    const details = (obj.geoKeywordDetails || []) as GeoKeywordDetail[];
    if (details.length > 0) {
      objectsWithGeoDetails += 1;
    }

    const mapReadyDetails = mapReady(details);
    if (mapReadyDetails.length > 0) {
      objectsMapReady += 1;

      const hasInside = mapReadyDetails.some(
        (detail) => detail.region === 'suriname',
      );
      const hasOutside = mapReadyDetails.some(
        (detail) =>
          detail.region === 'netherlands' || detail.region === 'other',
      );

      if (hasOutside && !hasInside) {
        objectsMapReadyOnlyOutsideSuriname += 1;
      } else if (hasOutside && hasInside) {
        objectsMapReadyMixedInsideOutside += 1;
      } else if (hasInside) {
        objectsMapReadyOnlyInsideSuriname += 1;
      }

      if (isGenericMapReady(mapReadyDetails)) {
        objectsOnlyGenericSurinameOrParamaribo += 1;
        genericRows.push([
          obj.objectnummer,
          obj.titles?.[0] || '',
          mapReadyDetails.map((detail) => detail.term).join(' | '),
          mapReadyDetails.map((detail) => detail.region || '').join(' | '),
        ]);
      } else {
        objectsWithSpecificMapReady += 1;
      }
      continue;
    }

    objectsNotMapReady += 1;
    const bucket = classifyProblem(details);
    problemBucketCounts[bucket] += 1;

    problemRows.push([
      obj.objectnummer,
      obj.titles?.[0] || '',
      bucket,
      (obj.geographicKeywords || []).join(' | '),
      details.map((detail) => detail.term).join(' | '),
      details.map((detail) => detail.source).join(' | '),
      details.map((detail) => detail.broaderTerm || '').join(' | '),
    ]);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    source: COLLECTION_PATH,
    totals: {
      objects: collection.length,
      objectsWithGeoDetails,
      objectsMapReady,
      objectsNotMapReady,
      objectsOnlyGenericSurinameOrParamaribo,
      objectsWithSpecificMapReady,
      objectsMapReadyOnlyInsideSuriname,
      objectsMapReadyOnlyOutsideSuriname,
      objectsMapReadyMixedInsideOutside,
    },
    problemBuckets: problemBucketCounts,
    notes: {
      mapReadyDefinition:
        'Object heeft minimaal 1 geoKeywordDetail met lat en lng.',
      genericDefinition:
        'Alle map-ready termen van object zijn uitsluitend Suriname of Paramaribo (incl. varianten met haakjes).',
      outsideSurinamePolicy:
        'Buiten-Suriname locaties mogen op kaart zichtbaar zijn als coordinaten bestaan, maar krijgen geen actieve curatieprioriteit in huidige fase.',
    },
    outputs: {
      summary: SUMMARY_PATH,
      genericCases: GENERIC_CASES_PATH,
      problemCases: PROBLEM_CASES_PATH,
    },
  };

  fs.writeFileSync(
    SUMMARY_PATH,
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf-8',
  );

  writeCsv(
    GENERIC_CASES_PATH,
    ['objectnummer', 'titel', 'map_ready_termen', 'regio'],
    genericRows,
  );

  writeCsv(
    PROBLEM_CASES_PATH,
    [
      'objectnummer',
      'titel',
      'probleem_bucket',
      'geografisch_trefwoord',
      'geo_detail_termen',
      'geo_detail_sources',
      'geo_detail_broader_terms',
    ],
    problemRows,
  );

  console.log(`Wrote summary: ${SUMMARY_PATH}`);
  console.log(
    `Wrote generic cases: ${GENERIC_CASES_PATH} (${genericRows.length})`,
  );
  console.log(
    `Wrote problem cases: ${PROBLEM_CASES_PATH} (${problemRows.length})`,
  );
}

main();
