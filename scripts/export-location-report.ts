import fs from 'fs';
import Papa from 'papaparse';
import path from 'path';

import {
  getGeoFlags,
  loadLocationEdits,
} from '../lib/location-curation';

const DATA_DIR = path.join(process.cwd(), 'data');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

function buildDefaultOutputPath() {
  const stamp = new Date().toISOString().slice(0, 10);
  return path.join(REPORTS_DIR, `location-edits-report-${stamp}.csv`);
}

function main() {
  const edits = loadLocationEdits();

  if (edits.length === 0) {
    console.log('No location edits found in data/location-edits.jsonl');
    return;
  }

  ensureReportsDir();

  const outputPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : buildDefaultOutputPath();

  const rows = edits.map((edit) => ({
    recordnummer: edit.recordnummer,
    objectnummer: edit.objectnummer,
    original_term: edit.originalTerm,
    resolved_location_label: edit.resolvedLocationLabel,
    wikidata_qid: edit.wikidataQid || '',
    wikidata_url: edit.wikidataUrl || '',
    stm_gazetteer_url: edit.gazetteerUrl || '',
    latitude: edit.lat ?? '',
    longitude: edit.lng ?? '',
    resolution_level: edit.resolutionLevel,
    evidence_source: edit.evidenceSource,
    evidence_text: edit.evidenceText || '',
    geo_flags: getGeoFlags(edit.lat, edit.lng).join('|'),
    author: edit.author,
    timestamp: edit.timestamp,
    remark: edit.remark || '',
  }));

  const csv = Papa.unparse(rows, {
    delimiter: ';',
    newline: '\n',
  });

  fs.writeFileSync(outputPath, csv, 'utf-8');

  console.log(`Wrote ${rows.length} location edits to ${outputPath}`);
}

main();