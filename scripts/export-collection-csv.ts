/**
 * Export the full enriched collection as a flat CSV file.
 *
 * Usage:
 *   pnpm export:collection                          # → data/reports/collection-export-<date>.csv
 *   pnpm export:collection --out /path/to/out.csv  # custom destination
 *
 * Array fields (titles, creators, objectTypes, etc.) are joined with " | ".
 * The primary Suriname geo-detail (the most specific mappable location) is
 * flattened into geo_* columns.
 */

import fs from 'fs';
import Papa from 'papaparse';
import path from 'path';
import {
  applyLocationEditsToObject,
  applyTermDefaultsToObject,
  buildLatestLocationEditMap,
  loadLocationEdits,
  loadTermDefaults,
} from '../lib/location-curation';
import type { CollectionObject, GeoKeywordDetail } from '../types/collection';

const DATA_DIR = path.join(process.cwd(), 'data');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');
const COLLECTION_JSON_PATH = path.join(DATA_DIR, 'collection.json');

// ── Geo helpers (mirrors lib/collection.ts without the React cache wrapper) ──

const EXCLUDED_LABELS = new Set(
  ['Sipaliwini Savanna', 'Suriname', 'Surinam', 'Suriname (Zuid-Amerika)'].map(
    (s) => s.toLowerCase().trim(),
  ),
);

function specificityScore(d: GeoKeywordDetail): number {
  if (d.resolutionLevel === 'exact') return 3;
  if (d.resolutionLevel === 'city') return 2;
  if (d.resolutionLevel === 'broader') return 1;
  return 0;
}

function pickPrimaryGeo(obj: CollectionObject): GeoKeywordDetail | null {
  const candidates = obj.geoKeywordDetails.filter(
    (d) =>
      d.lat !== null &&
      d.lng !== null &&
      d.region === 'suriname' &&
      d.resolutionLevel !== 'country' &&
      !EXCLUDED_LABELS.has((d.matchedLabel || d.term).toLowerCase().trim()),
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort(
    (a, b) => specificityScore(b) - specificityScore(a),
  )[0];
}

// ── CSV row shape ──────────────────────────────────────────────────────────

function join(arr: string[]): string {
  return arr.join(' | ');
}

function toRow(obj: CollectionObject) {
  const geo = pickPrimaryGeo(obj);
  return {
    recordnummer: obj.recordnummer,
    objectnummer: obj.objectnummer,
    title: obj.titles[0] ?? '',
    all_titles: join(obj.titles),
    description: obj.description,
    creators: join(obj.creators),
    date_start: obj.dateStart,
    date_end: obj.dateEnd,
    year: obj.year ?? '',
    object_types: join(obj.objectTypes),
    materials: join(obj.materials),
    classification_code: obj.classificationCode,
    content_classification_codes: join(obj.contentClassificationCodes),
    geographic_keywords: join(obj.geographicKeywords),
    subjects: join(obj.subjects),
    persons: join(obj.persons),
    main_motif_general: join(obj.mainMotifGeneral),
    main_motif_specific: join(obj.mainMotifSpecific),
    pid_data_uri: obj.pidData,
    pid_work_uri: obj.pidWork,
    thumbnail_url: obj.thumbnailUrl ?? '',
    image_url: obj.imageUrl ?? '',
    has_image: obj.hasImage ? 'yes' : 'no',
    is_public_domain: obj.isPublicDomain ? 'yes' : 'no',
    license: obj.license ?? '',
    license_label: obj.licenseLabel ?? '',
    wikidata_url: obj.wikidataUrl ?? '',
    wikimedia_url: obj.wikimediaUrl ?? '',
    // Primary Suriname geo detail
    geo_term: geo?.term ?? '',
    geo_matched_label: geo?.matchedLabel ?? '',
    geo_lat: geo?.lat ?? '',
    geo_lng: geo?.lng ?? '',
    geo_source: geo?.source ?? '',
    geo_resolution_level: geo?.resolutionLevel ?? '',
    geo_wikidata_uri: geo?.wikidataUri ?? '',
    geo_stm_gazetteer_url: geo?.stmGazetteerUrl ?? '',
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

function buildDefaultOutputPath(): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return path.join(REPORTS_DIR, `collection-export-${stamp}.csv`);
}

function parseArgs(): { outputPath: string } {
  const args = process.argv.slice(2);
  let outputPath = buildDefaultOutputPath();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) {
      outputPath = path.resolve(process.cwd(), args[i + 1]);
      i++;
    }
  }
  return { outputPath };
}

function main() {
  const { outputPath } = parseArgs();

  // Load raw collection
  const raw = JSON.parse(
    fs.readFileSync(COLLECTION_JSON_PATH, 'utf-8'),
  ) as CollectionObject[];

  // Apply location edits + term defaults (same pipeline as the webapp)
  const latestEdits = buildLatestLocationEditMap(loadLocationEdits());
  const termDefaults = loadTermDefaults();
  const enriched = raw
    .map((obj) => applyLocationEditsToObject(obj, latestEdits))
    .map((obj) => applyTermDefaultsToObject(obj, termDefaults));

  const rows = enriched.map(toRow);

  // Write CSV
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const csv = Papa.unparse(rows, { delimiter: ';', newline: '\n' });
  fs.writeFileSync(outputPath, csv, 'utf-8');

  console.log(`✓ Exported ${rows.length} objects → ${outputPath}`);
}

main();
