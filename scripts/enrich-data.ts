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

interface ImageCache {
  [pidDataId: string]: {
    thumbnailUrl: string | null;
    imageUrl: string | null;
  };
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

/**
 * Resolve IIIF image URL via 2-hop Linked Art traversal:
 *   1. Compute VisualItem ID:  PID "200xxxxx" → "202xxxxx"
 *   2. Fetch VisualItem → digitally_shown_by[].id  → DigitalObject URL
 *   3. Fetch DigitalObject → access_point[].id      → IIIF image URL
 */
async function resolveImageUrl(
  pidDataUri: string,
): Promise<{ thumbnailUrl: string | null; imageUrl: string | null }> {
  const pidId = extractPidId(pidDataUri);
  if (!pidId) return { thumbnailUrl: null, imageUrl: null };

  try {
    // --- Hop 1: Compute VisualItem ID (replace "200" prefix with "202") ---
    const visualItemId = pidId.replace(/^200/, '202');

    const viResponse = await fetch(
      `https://data.rijksmuseum.nl/${visualItemId}`,
      { headers: LA_HEADERS, redirect: 'follow' },
    );
    if (!viResponse.ok) {
      return { thumbnailUrl: null, imageUrl: null };
    }

    const viData = await viResponse.json();

    // Extract DigitalObject reference from digitally_shown_by
    const dsbArr = Array.isArray(viData.digitally_shown_by)
      ? viData.digitally_shown_by
      : viData.digitally_shown_by
        ? [viData.digitally_shown_by]
        : [];
    const digitalObjectUrl = dsbArr[0]?.id;

    if (!digitalObjectUrl) {
      return { thumbnailUrl: null, imageUrl: null };
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
      return { thumbnailUrl: null, imageUrl: null };
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
      return { thumbnailUrl: null, imageUrl: null };
    }

    // Extract IIIF image ID from URL
    // e.g. https://iiif.micr.io/HNZox/full/max/0/default.jpg → HNZox
    const iiifMatch = iiifBaseUrl.match(/iiif\.micr\.io\/([^/]+)/);
    if (iiifMatch) {
      const imageId = iiifMatch[1];
      return {
        thumbnailUrl: `https://iiif.micr.io/${imageId}/full/400,/0/default.jpg`,
        imageUrl: `https://iiif.micr.io/${imageId}/full/1920,/0/default.jpg`,
      };
    }

    return { thumbnailUrl: null, imageUrl: null };
  } catch {
    return { thumbnailUrl: null, imageUrl: null };
  }
}

async function processBatch(
  rows: CsvRow[],
  cache: ImageCache,
): Promise<CollectionObject[]> {
  const results: CollectionObject[] = [];

  const imagePromises = rows.map(async (row) => {
    const pidId = extractPidId(row['PID_data.URI']);
    if (pidId && cache[pidId]) {
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
