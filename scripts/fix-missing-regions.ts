import { NETHERLANDS_BOUNDS, SURINAME_BOUNDS } from '@/lib/location-curation';
import type { CollectionObject } from '@/types/collection';
import fs from 'fs';
import path from 'path';

const dataPath = path.join(process.cwd(), 'data/collection.json');

function getRegion(
  lat: number,
  lng: number,
): 'suriname' | 'netherlands' | 'other' {
  if (
    lat >= SURINAME_BOUNDS.minLat &&
    lat <= SURINAME_BOUNDS.maxLat &&
    lng >= SURINAME_BOUNDS.minLng &&
    lng <= SURINAME_BOUNDS.maxLng
  ) {
    return 'suriname';
  }
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

const raw = fs.readFileSync(dataPath, 'utf-8');
const collection = JSON.parse(raw) as CollectionObject[];

let fixedCount = 0;

for (const obj of collection) {
  if (!obj.geoKeywordDetails) continue;
  for (const detail of obj.geoKeywordDetails) {
    if (
      !detail.region &&
      typeof detail.lat === 'number' &&
      typeof detail.lng === 'number' &&
      !Number.isNaN(detail.lat) &&
      !Number.isNaN(detail.lng)
    ) {
      detail.region = getRegion(detail.lat, detail.lng);
      fixedCount++;
    }
  }
}

fs.writeFileSync(dataPath, JSON.stringify(collection, null, 2), 'utf-8');

console.log(`Fixed ${fixedCount} missing regions`);
