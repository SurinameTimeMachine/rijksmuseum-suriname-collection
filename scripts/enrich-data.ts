/**
 * Data enrichment script for the Rijksmuseum Suriname Collection.
 *
 * Reads the CSV, resolves each object's PID to get IIIF image URLs,
 * splits multi-value fields, normalizes dates, and writes collection.json.
 *
 * Usage: npx tsx scripts/enrich-data.ts
 *
 * Features:
 * - Caches resolved PIDs to .cache/ for resumable runs
 * - Rate-limits to ~10 concurrent requests
 * - Progress logging
 */

import fs from 'fs';
import Papa from 'papaparse';
import path from 'path';
import type { CollectionObject, GeoKeywordDetail } from '../types/collection';
import { geoCoordinates } from '../data/geo-coordinates';

const DATA_DIR = path.join(process.cwd(), 'data');
const CSV_PATH = path.join(DATA_DIR, 'Suriname_objecten_export.csv');
const GEO_CSV_PATH = path.join(DATA_DIR, 'Geo thesau Suriname.csv');
const WIKIDATA_CSV_PATH = path.join(DATA_DIR, 'results_wikidata_commons.csv');
const OUTPUT_PATH = path.join(DATA_DIR, 'collection.json');
const CACHE_DIR = path.join(DATA_DIR, '.cache');

const CONCURRENCY = 10;
const DELAY_MS = 100; // delay between batches

interface CsvRow {
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
}

interface ImageCacheEntry {
  thumbnailUrl: string | null;
  imageUrl: string | null;
  copyrightHolder: string | null;
  license: string | null;
  licenseLabel: string | null;
}

interface ImageCache {
  [pidDataId: string]: ImageCacheEntry;
}

/**
 * Load the geographic thesaurus CSV and build a lookup map keyed by term name.
 * The CSV has duplicate column names ("PID_overige.URI" x3), so we parse
 * without headers and use column indices.
 * File is ISO-8859-1 encoded.
 */
function loadGeoThesaurus(): Map<string, GeoKeywordDetail> {
  const map = new Map<string, GeoKeywordDetail>();

  if (!fs.existsSync(GEO_CSV_PATH)) {
    console.warn('⚠️  Geo thesaurus CSV not found, skipping');
    return map;
  }

  const raw = fs.readFileSync(GEO_CSV_PATH);
  // Decode as latin1 (ISO-8859-1)
  const csvContent = new TextDecoder('latin1').decode(raw);

  const parsed = Papa.parse<string[]>(csvContent, {
    header: false,
    delimiter: ';',
    skipEmptyLines: true,
  });

  // Skip header row (index 0)
  for (let i = 1; i < parsed.data.length; i++) {
    const cols = parsed.data[i];
    const term = (cols[1] || '').trim();
    if (!term) continue;

    const broaderTerm = (cols[2] || '').trim() || null;

    // Columns 3-5 are all "PID_overige.URI" — categorize by domain
    let gettyUri: string | null = null;
    let wikidataUri: string | null = null;
    let geonamesUri: string | null = null;

    for (let c = 3; c <= 5; c++) {
      const uri = (cols[c] || '').trim();
      if (!uri) continue;
      if (uri.includes('vocab.getty.edu')) gettyUri = uri;
      else if (uri.includes('wikidata.org')) wikidataUri = uri;
      else if (uri.includes('geonames.org')) geonamesUri = uri;
    }

    map.set(term, {
      term,
      broaderTerm,
      gettyUri,
      wikidataUri,
      geonamesUri,
      lat: geoCoordinates[term]?.lat ?? null,
      lng: geoCoordinates[term]?.lng ?? null,
      region: geoCoordinates[term]?.region ?? null,
      source: 'thesaurus',
    });
  }

  return map;
}

interface WikidataEntry {
  wikidataUrl: string | null;
  wikimediaUrl: string | null;
}

/**
 * Load the Wikidata/Wikimedia Commons CSV and build a lookup map keyed by recordnummer.
 */
function loadWikidataCommons(): Map<string, WikidataEntry> {
  const map = new Map<string, WikidataEntry>();

  if (!fs.existsSync(WIKIDATA_CSV_PATH)) {
    console.warn('⚠️  Wikidata CSV not found, skipping');
    return map;
  }

  const csvContent = fs.readFileSync(WIKIDATA_CSV_PATH, 'utf-8');

  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  for (const row of parsed.data) {
    const rn = (row.recordnummer || '').trim();
    if (!rn) continue;

    map.set(rn, {
      wikidataUrl: (row.wikidata_url || '').trim() || null,
      wikimediaUrl: (row.wikimedia_url || '').trim() || null,
    });
  }

  return map;
}

function splitMultiValue(value: string): string[] {
  if (!value || value === '""' || value === '') return [];
  return value
    .split('$')
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Build location details for every keyword with explicit provenance.
 * Matching is strict and exact only (no fuzzy matching).
 */
function buildGeoKeywordDetails(
  keywords: string[],
  geoThesaurus: Map<string, GeoKeywordDetail>,
): GeoKeywordDetail[] {
  return keywords.map((kw) => {
    const thesaurusDetail = geoThesaurus.get(kw);
    if (thesaurusDetail) {
      return thesaurusDetail;
    }

    const coord = geoCoordinates[kw];
    if (coord) {
      return {
        term: kw,
        broaderTerm: null,
        gettyUri: null,
        wikidataUri: null,
        geonamesUri: null,
        lat: coord.lat,
        lng: coord.lng,
        region: coord.region,
        source: 'coordinates',
      };
    }

    return {
      term: kw,
      broaderTerm: null,
      gettyUri: null,
      wikidataUri: null,
      geonamesUri: null,
      lat: null,
      lng: null,
      region: null,
      source: 'unresolved',
    };
  });
}

function extractYear(dateStr: string): number | null {
  if (!dateStr || dateStr === '""' || dateStr === '') return null;
  const match = dateStr.match(/^(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

function extractPidId(uri: string): string | null {
  if (!uri) return null;
  const match = uri.match(/\/(\d+)$/);
  return match ? match[1] : null;
}

function loadCache(): ImageCache {
  const cachePath = path.join(CACHE_DIR, 'images.json');
  if (fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  }
  return {};
}

function saveCache(cache: ImageCache): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  fs.writeFileSync(
    path.join(CACHE_DIR, 'images.json'),
    JSON.stringify(cache, null, 2),
  );
}

const LA_HEADERS = {
  Accept: 'application/ld+json',
  Profile: 'https://linked.art/ns/v1/linked-art.json',
};

const EMPTY_RESULT: ImageCacheEntry = {
  thumbnailUrl: null,
  imageUrl: null,
  copyrightHolder: null,
  license: null,
  licenseLabel: null,
};

/**
 * Extract rights / license information from a VisualItem Linked Art response.
 *
 * Looks for:
 * - `referred_to_by[]` with classified_as aat:300435434 → copyright/license statement text
 * - `subject_to[]` with type "Right" → classified_as URI (e.g. CC0)
 * - Copyright holder from referred_to_by classified as aat:300055292 or aat:300026687
 */
function extractRightsInfo(viData: Record<string, unknown>): {
  copyrightHolder: string | null;
  license: string | null;
  licenseLabel: string | null;
} {
  let copyrightHolder: string | null = null;
  let license: string | null = null;
  let licenseLabel: string | null = null;

  // --- referred_to_by: license/rights statements ---
  const rArr = Array.isArray(viData.referred_to_by)
    ? viData.referred_to_by
    : viData.referred_to_by
      ? [viData.referred_to_by]
      : [];

  for (const ref of rArr) {
    const classIds = (Array.isArray(ref.classified_as) ? ref.classified_as : [])
      .map((c: { id?: string }) => c.id)
      .filter(Boolean);

    // aat:300435434 = Copyright/License Statement
    if (classIds.some((id: string) => id.includes('300435434'))) {
      licenseLabel = ref.content || licenseLabel;
    }

    // aat:300055292 = copyright holder / aat:300026687 = acknowledgements
    if (
      classIds.some(
        (id: string) => id.includes('300055292') || id.includes('300026687'),
      )
    ) {
      copyrightHolder = ref.content || copyrightHolder;
    }
  }

  // --- subject_to: structured Rights ---
  const stArr = Array.isArray(viData.subject_to)
    ? viData.subject_to
    : viData.subject_to
      ? [viData.subject_to]
      : [];

  for (const right of stArr) {
    if (right.type !== 'Right') continue;

    const rightClassIds = (
      Array.isArray(right.classified_as) ? right.classified_as : []
    )
      .map((c: { id?: string }) => c.id)
      .filter(Boolean);

    for (const id of rightClassIds) {
      if (typeof id === 'string' && id.includes('creativecommons.org')) {
        license = id;
      }
    }

    // Also extract the right's name if we don't have a label yet
    if (!licenseLabel && right.identified_by) {
      const names = Array.isArray(right.identified_by)
        ? right.identified_by
        : [right.identified_by];
      for (const n of names) {
        if (n.content) {
          licenseLabel = n.content;
          break;
        }
      }
    }
  }

  return { copyrightHolder, license, licenseLabel };
}

/**
 * Determine if an object's image is public domain based on its license data.
 *
 * Public domain when:
 * - licenseLabel is "Public Domain" or "Publieke domein" (Dutch equivalent)
 * - license URI is a CC public domain mark or CC0
 * - No license data at all (Rijksmuseum default — own digitizations are CC0)
 *
 * NOT public domain when licenseLabel contains a person/entity name
 * (copyright holder names are returned in the licenseLabel field by the API).
 */
function isPublicDomainLicense(
  license: string | null,
  licenseLabel: string | null,
  copyrightHolder: string | null,
): boolean {
  // If there's a named copyright holder, it's not public domain
  if (copyrightHolder) return false;

  // No license data at all — assume public domain (Rijksmuseum default)
  if (!licenseLabel && !license) return true;

  // Check the label for known public domain strings
  if (licenseLabel) {
    const lower = licenseLabel.toLowerCase();
    if (lower === 'public domain' || lower === 'publieke domein') return true;
    // If the label is a name (copyright holder), it's not public domain
    // Known PD labels are exact matches above; anything else is a rights holder
    if (lower !== 'copyright' && lower !== 'auteursrecht') {
      // "Copyright" / "Auteursrecht" without a holder name — check the URI
      return false;
    }
  }

  // Check the license URI
  if (license) {
    if (license.includes('publicdomain') || license.includes('zero')) {
      return true;
    }
    // Has a license URI that isn't public domain
    return false;
  }

  return true;
}

/**
 * Resolve IIIF image URL and rights via 2-hop Linked Art traversal:
 *   1. Compute VisualItem ID:  PID "200xxxxx" → "202xxxxx"
 *   2. Fetch VisualItem → digitally_shown_by[].id  → DigitalObject URL
 *      Also extract rights info from the VisualItem.
 *   3. Fetch DigitalObject → access_point[].id      → IIIF image URL
 */
async function resolveImageUrl(pidDataUri: string): Promise<ImageCacheEntry> {
  const pidId = extractPidId(pidDataUri);
  if (!pidId) return EMPTY_RESULT;

  try {
    // --- Hop 1: Compute VisualItem ID (replace "200" prefix with "202") ---
    const visualItemId = pidId.replace(/^200/, '202');

    const viResponse = await fetch(
      `https://data.rijksmuseum.nl/${visualItemId}`,
      { headers: LA_HEADERS, redirect: 'follow' },
    );
    if (!viResponse.ok) {
      return EMPTY_RESULT;
    }

    const viData = await viResponse.json();

    // Extract rights info from the VisualItem response
    const rightsInfo = extractRightsInfo(viData);

    // Extract DigitalObject reference from digitally_shown_by
    const dsbArr = Array.isArray(viData.digitally_shown_by)
      ? viData.digitally_shown_by
      : viData.digitally_shown_by
        ? [viData.digitally_shown_by]
        : [];
    const digitalObjectUrl = dsbArr[0]?.id;

    if (!digitalObjectUrl) {
      return { ...EMPTY_RESULT, ...rightsInfo };
    }

    // --- Hop 2: Fetch DigitalObject to get the IIIF access_point ---
    const doResponse = await fetch(
      digitalObjectUrl.replace('id.rijksmuseum.nl', 'data.rijksmuseum.nl'),
      {
        headers: LA_HEADERS,
        redirect: 'follow',
      },
    );
    if (!doResponse.ok) {
      return { ...EMPTY_RESULT, ...rightsInfo };
    }

    const doData = await doResponse.json();

    // Find IIIF URL in access_point
    const apArr = Array.isArray(doData.access_point)
      ? doData.access_point
      : doData.access_point
        ? [doData.access_point]
        : [];

    let iiifBaseUrl: string | null = null;
    for (const ap of apArr) {
      if (ap.id && ap.id.includes('iiif.micr.io')) {
        iiifBaseUrl = ap.id;
        break;
      }
    }

    if (!iiifBaseUrl) {
      return { ...EMPTY_RESULT, ...rightsInfo };
    }

    // Extract IIIF image ID from URL
    // e.g. https://iiif.micr.io/HNZox/full/max/0/default.jpg → HNZox
    const iiifMatch = iiifBaseUrl.match(/iiif\.micr\.io\/([^/]+)/);
    if (iiifMatch) {
      const imageId = iiifMatch[1];
      return {
        thumbnailUrl: `https://iiif.micr.io/${imageId}/full/400,/0/default.jpg`,
        imageUrl: `https://iiif.micr.io/${imageId}/full/1920,/0/default.jpg`,
        ...rightsInfo,
      };
    }

    return { ...EMPTY_RESULT, ...rightsInfo };
  } catch {
    return EMPTY_RESULT;
  }
}

async function processBatch(
  rows: CsvRow[],
  cache: ImageCache,
  geoThesaurus: Map<string, GeoKeywordDetail>,
  wikidataMap: Map<string, WikidataEntry>,
): Promise<CollectionObject[]> {
  const results: CollectionObject[] = [];

  const imagePromises = rows.map(async (row) => {
    const pidId = extractPidId(row['PID_data.URI']);
    if (pidId && cache[pidId] && 'license' in cache[pidId]) {
      return cache[pidId];
    }
    const imageData = await resolveImageUrl(row['PID_data.URI']);
    if (pidId) {
      cache[pidId] = imageData;
    }
    return imageData;
  });

  const imageResults = await Promise.all(imagePromises);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const imageData = imageResults[i];
    const year = extractYear(row['datering.datum.start']);
    const geographicKeywords = splitMultiValue(row.geografisch_trefwoord);

    const obj: CollectionObject = {
      recordnummer: parseInt(row.recordnummer, 10),
      objectnummer: row.objectnummer,
      titles: splitMultiValue(row.titel),
      description: row.beschrijving || '',
      creators: splitMultiValue(row.vervaardiger),
      dateStart: row['datering.datum.start'] || '',
      dateEnd: row['datering.datum.eind'] || '',
      year,
      objectTypes: splitMultiValue(row.objectnaam),
      materials: splitMultiValue(row.materiaal),
      classificationCode: row.classificatiecode || '',
      contentClassificationCodes: splitMultiValue(
        row['inhoud.classificatie.code'],
      ),
      geographicKeywords,
      geoKeywordDetails: buildGeoKeywordDetails(
        geographicKeywords,
        geoThesaurus,
      ),
      mainMotifGeneral: splitMultiValue(row['inhoud.hoofdmotief.algemeen']),
      mainMotifSpecific: splitMultiValue(row['inhoud.hoofdmotief.specifiek']),
      subjects: splitMultiValue(row['inhoud.onderwerp']),
      persons: splitMultiValue(row['inhoud.persoon.naam']),
      pidData: row['PID_data.URI'] || '',
      pidWork: row['PID_werk.URI'] || '',
      thumbnailUrl: imageData.thumbnailUrl,
      imageUrl: imageData.imageUrl,
      hasImage: !!imageData.thumbnailUrl,
      copyrightHolder: imageData.copyrightHolder,
      license: imageData.license,
      licenseLabel: imageData.licenseLabel,
      isPublicDomain: isPublicDomainLicense(
        imageData.license,
        imageData.licenseLabel,
        imageData.copyrightHolder,
      ),
      wikidataUrl: wikidataMap.get(row.recordnummer)?.wikidataUrl ?? null,
      wikimediaUrl: wikidataMap.get(row.recordnummer)?.wikimediaUrl ?? null,
    };

    results.push(obj);
  }

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('🏛️  Rijksmuseum Suriname Collection — Data Enrichment');
  console.log('='.repeat(55));

  // Read CSV
  console.log(`\nReading CSV from ${CSV_PATH}...`);
  const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');

  const parsed = Papa.parse<CsvRow>(csvContent, {
    header: true,
    delimiter: ';',
    skipEmptyLines: true,
  });

  console.log(`Parsed ${parsed.data.length} records from CSV`);

  if (parsed.errors.length > 0) {
    console.warn(`⚠️  ${parsed.errors.length} parse errors encountered`);
    parsed.errors.slice(0, 5).forEach((e) => console.warn(`  - ${e.message}`));
  }

  // Load auxiliary data sources
  console.log(`\nLoading auxiliary data sources...`);
  const geoThesaurus = loadGeoThesaurus();
  console.log(`📍 Geo thesaurus: ${geoThesaurus.size} geographic terms`);
  const wikidataMap = loadWikidataCommons();
  console.log(`🔗 Wikidata/Commons: ${wikidataMap.size} linked objects`);

  // Load cache
  const cache = loadCache();
  const cachedCount = Object.keys(cache).length;
  if (cachedCount > 0) {
    console.log(`📦 Loaded ${cachedCount} cached image resolutions`);
  }

  // Process in batches
  const allObjects: CollectionObject[] = [];
  const rows = parsed.data;
  const totalBatches = Math.ceil(rows.length / CONCURRENCY);

  console.log(
    `\nResolving images for ${rows.length} objects (${CONCURRENCY} concurrent, ${totalBatches} batches)...\n`,
  );

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const batchNum = Math.floor(i / CONCURRENCY) + 1;
    const results = await processBatch(batch, cache, geoThesaurus, wikidataMap);
    allObjects.push(...results);

    const progress = Math.round(((i + batch.length) / rows.length) * 100);
    const withImages = allObjects.filter((o) => o.hasImage).length;
    process.stdout.write(
      `\r  Batch ${batchNum}/${totalBatches} — ${progress}% — ${allObjects.length} processed, ${withImages} with images`,
    );

    // Save cache periodically (every 10 batches)
    if (batchNum % 10 === 0) {
      saveCache(cache);
    }

    if (i + CONCURRENCY < rows.length) {
      await sleep(DELAY_MS);
    }
  }

  // Final cache save
  saveCache(cache);

  console.log(`\n\n✅ Enrichment complete!`);
  console.log(`   Total objects: ${allObjects.length}`);
  console.log(`   With images: ${allObjects.filter((o) => o.hasImage).length}`);
  console.log(
    `   Without images: ${allObjects.filter((o) => !o.hasImage).length}`,
  );

  // Write output
  console.log(`\nWriting ${OUTPUT_PATH}...`);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(allObjects, null, 2));
  console.log(`✅ Done! Output: ${OUTPUT_PATH}`);

  // Quick stats
  const types = new Set<string>();
  const locations = new Set<string>();
  allObjects.forEach((o) => {
    o.objectTypes.forEach((t) => types.add(t));
    o.geographicKeywords.forEach((g) => locations.add(g));
  });
  console.log(`\n📊 Quick stats:`);
  console.log(`   Unique object types: ${types.size}`);
  console.log(`   Unique locations: ${locations.size}`);
  const withGeoDetails = allObjects.filter(
    (o) => o.geoKeywordDetails.length > 0,
  ).length;
  console.log(`   With geo thesaurus details: ${withGeoDetails}`);
  const withWikidata = allObjects.filter((o) => o.wikidataUrl).length;
  const withWikimedia = allObjects.filter((o) => o.wikimediaUrl).length;
  console.log(`   With Wikidata URL: ${withWikidata}`);
  console.log(`   With Wikimedia Commons URL: ${withWikimedia}`);
  const years = allObjects
    .map((o) => o.year)
    .filter((y): y is number => y !== null);
  if (years.length)
    console.log(`   Date range: ${Math.min(...years)} — ${Math.max(...years)}`);
}

main().catch(console.error);
