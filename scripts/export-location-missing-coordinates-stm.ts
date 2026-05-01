import fs from 'fs';
import Papa from 'papaparse';
import path from 'path';
import * as xlsx from 'xlsx';

const DATA_DIR = path.join(process.cwd(), 'data');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');
const OBJECT_CSV_PATH = path.join(DATA_DIR, 'Suriname_objecten_export.csv');
const STM_GAZETTEER_PATH = path.join(DATA_DIR, 'places-gazetteer.jsonld');
const REVIEW_XLSX_PATH = path.join(DATA_DIR, 'reports', 'location-missing-coordinates-manual-labeled.xlsx');

type GazetteerName = {
  text?: string;
  isPreferred?: boolean;
};

type GazetteerPlace = {
  id?: string;
  locId?: string;
  ['@id']?: string;
  wikidataQid?: string;
  location?: {
    lat?: number;
    lng?: number;
  };
  names?: GazetteerName[];
};

type GazetteerEntry = {
  lat: number;
  lng: number;
  label: string;
};

function normalizeStmId(rawId?: string): string | null {
  if (!rawId) return null;
  if (rawId.startsWith('stm-')) return rawId;

  const stmMatch = rawId.match(/stm-[0-9a-zA-Z-]+/i);
  if (stmMatch) return stmMatch[0].toLowerCase();

  return null;
}

function getPlaceLabel(place: GazetteerPlace): string {
  const names = Array.isArray(place.names) ? place.names : [];
  return names.find((n) => n.isPreferred)?.text || names[0]?.text || '';
}

function loadReviewXlsx() {
  const workbook = xlsx.readFile(REVIEW_XLSX_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  return rows as any[];
}

function loadGazetteer() {
  const raw = fs.readFileSync(STM_GAZETTEER_PATH, 'utf-8');
  const json = JSON.parse(raw);
  const byQid = new Map<string, GazetteerEntry>();
  const byStmId = new Map<string, GazetteerEntry>();
  const graph = Array.isArray(json['@graph'])
    ? (json['@graph'] as GazetteerPlace[])
    : [];

  for (const place of graph) {
    const lat = place.location?.lat;
    const lng = place.location?.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;

    const entry: GazetteerEntry = {
      lat,
      lng,
      label: getPlaceLabel(place),
    };

    const stmId = normalizeStmId(place.locId || place.id || place['@id']);
    if (stmId) {
      byStmId.set(stmId, entry);
    }

    if (place.wikidataQid) {
      byQid.set(place.wikidataQid, entry);
    }
  }

  return { byQid, byStmId };
}

async function main() {
  // Lees collectie CSV en bouw objectByNum
  const collectionCsv = fs.readFileSync(OBJECT_CSV_PATH, 'utf-8');
  const collectionRows = Papa.parse(collectionCsv, { header: true, skipEmptyLines: true }).data as any[];
  const objectByNum: Record<string, any> = {};
  for (const row of collectionRows) {
    objectByNum[row['objectnummer']] = row;
  }

  // Reviewbestand inlezen
  const reviewRows = loadReviewXlsx();

  // Debug-output
  console.log('Aantal objecten in collectie:', Object.keys(objectByNum).length);
  console.log('Aantal regels in reviewbestand:', reviewRows.length);

  // Laad gazetteer
  const { byQid, byStmId } = loadGazetteer();
  const wikidataCoords: Record<string, any> = {};

  // Verzamel per afbeelding (PID_werk.URI) alle locaties, maximaal 2 per record
  const wideMap = new Map();
  let matchedRows = 0;

  for (const row of reviewRows) {
    const objNums = (row['sample_objectnummers'] || '').split(/[,;|]/).map((s: string) => s.trim()).filter(Boolean);
    const idAdded = (row['ID_added'] || '').split(/[,;|]/).map((s: string) => s.trim()).filter(Boolean);

    for (const objNum of objNums) {
      const obj = objectByNum[objNum];
      if (!obj) {
        console.log('[DEBUG] Geen match voor objectnummer uit review:', objNum);
        continue;
      }

      const pid = obj['PID_werk.URI'] || '';
      if (!pid) continue;

      matchedRows++;

      if (!wideMap.has(pid)) {
        wideMap.set(pid, {
          pid_werk_uri: pid,
          objectnummer: objNum,
          afbeelding_link: pid,
          titel: obj['titel'] || '',
          beschrijving: obj['beschrijving'] || '',
          geo_trefwoord: obj['geografisch_trefwoord'] || '',
          locaties: []
        });
      }

      const entry = wideMap.get(pid);

      // Voeg locaties toe (max 2 per record)
      for (const locId of idAdded) {
        if (entry.locaties.length >= 2) break;

        let naam = '', lat = '', lng = '';

        if (locId.startsWith('Q')) {
          const stm = byQid.get(locId);
          if (stm) {
            naam = stm.label;
            lat = String(stm.lat);
            lng = String(stm.lng);
          } else if (wikidataCoords[locId] && wikidataCoords[locId][0]) {
            naam = row['resolved_label'] || '';
            lat = wikidataCoords[locId][0].lat;
            lng = wikidataCoords[locId][0].lng;
          }
        } else if (locId.startsWith('stm-')) {
          const stm = byStmId.get(locId.toLowerCase());
          if (stm) {
            naam = stm.label;
            lat = String(stm.lat);
            lng = String(stm.lng);
          }
        } else if (locId.startsWith('http') && locId.includes('geonames.org')) {
          naam = row['resolved_label'] || '';
        }

        entry.locaties.push({
          locatie_id: locId,
          locatie_naam: naam,
          locatie_lat: lat,
          locatie_lng: lng
        });
      }
    }
  }

  console.log('Aantal matches met collectie:', matchedRows);

  // Zet om naar breed formaat
  const results = [];
  for (const entry of wideMap.values()) {
    for (let i = 0; i < 2; i++) {
      const loc = entry.locaties[i] || {};
      entry[`locatie${i+1}_id`] = loc.locatie_id || '';
      entry[`locatie${i+1}_naam`] = loc.locatie_naam || '';
      entry[`locatie${i+1}_lat`] = loc.locatie_lat || '';
      entry[`locatie${i+1}_lng`] = loc.locatie_lng || '';
    }
    delete entry.locaties;
    results.push(entry);
  }

  // Schrijf CSV
  const outPath = path.join(REPORTS_DIR, 'location-review-export.csv');
  fs.writeFileSync(outPath, Papa.unparse(results, { delimiter: ',', newline: '\n' }), 'utf-8');
  console.log(`Wrote ${results.length} records to ${outPath}`);
}

main().catch(e => {
  console.error('Fout tijdens uitvoeren script:', e);
  process.exit(1);
});
