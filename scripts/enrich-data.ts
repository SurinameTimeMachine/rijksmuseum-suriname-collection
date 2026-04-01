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
import type { CollectionObject } from '../types/collection';

const DATA_DIR = path.join(process.cwd(), 'data');
const CSV_PATH = path.join(DATA_DIR, 'Suriname_objecten_export.csv');
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

function splitMultiValue(value: string): string[] {
  if (!value || value === '""' || value === '') return [];
  return value
    .split('$')
    .map((v) => v.trim())
    .filter(Boolean);
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
      geographicKeywords: splitMultiValue(row.geografisch_trefwoord),
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
    const results = await processBatch(batch, cache);
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
  const years = allObjects
    .map((o) => o.year)
    .filter((y): y is number => y !== null);
  if (years.length)
    console.log(`   Date range: ${Math.min(...years)} — ${Math.max(...years)}`);
}

main().catch(console.error);
