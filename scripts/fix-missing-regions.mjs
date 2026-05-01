import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '../data/collection.json');

// Bounding boxes for regions
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

function getRegion(lat, lng) {
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

// Read collection
const raw = fs.readFileSync(dataPath, 'utf-8');
const collection = JSON.parse(raw);

let fixedCount = 0;

collection.forEach((obj) => {
  if (obj.geoKeywordDetails) {
    obj.geoKeywordDetails.forEach((detail) => {
      // If region is missing and we have valid coordinates, assign it
      if (
        !detail.region &&
        typeof detail.lat === 'number' &&
        typeof detail.lng === 'number' &&
        !isNaN(detail.lat) &&
        !isNaN(detail.lng)
      ) {
        detail.region = getRegion(detail.lat, detail.lng);
        fixedCount++;
      }
    });
  }
});

// Write back
fs.writeFileSync(dataPath, JSON.stringify(collection, null, 2), 'utf-8');

console.log(`Fixed ${fixedCount} missing regions`);
