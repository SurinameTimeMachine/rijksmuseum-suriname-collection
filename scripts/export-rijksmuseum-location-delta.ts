import fs from 'fs';
import Papa from 'papaparse';
import path from 'path';

import { loadLocationEdits } from '../lib/location-curation';
import type { CollectionObject } from '../types/collection';

const DATA_DIR = path.join(process.cwd(), 'data');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');
const COLLECTION_JSON_PATH = path.join(DATA_DIR, 'collection.json');

type CliOptions = {
  outputPath: string;
  since: string | null;
};

type DeltaRow = {
  recordnummer: number;
  objectnummer: string;
  original_term: string;
  resolved_location_label: string;
  wikidata_qid: string;
  wikidata_url: string;
  latitude: number | '';
  longitude: number | '';
  resolution_level: string;
  evidence_source: string;
  evidence_text: string;
  author: string;
  timestamp: string;
  remark: string;
  pid_data_uri: string;
  pid_werk_uri: string;
};

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

function buildDefaultOutputPath() {
  const stamp = new Date().toISOString().slice(0, 10);
  return path.join(REPORTS_DIR, `rijksmuseum-location-delta-${stamp}.csv`);
}

function parseCliArgs(): CliOptions {
  const args = process.argv.slice(2);

  let outputPath = buildDefaultOutputPath();
  let since: string | null = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--out') {
      outputPath = args[i + 1]
        ? path.resolve(process.cwd(), args[i + 1])
        : outputPath;
      i += 1;
      continue;
    }

    if (arg === '--since') {
      since = args[i + 1] ? args[i + 1].trim() : null;
      i += 1;
      continue;
    }
  }

  if (since) {
    const millis = Date.parse(since);
    if (!Number.isFinite(millis)) {
      throw new Error(`Invalid --since value: ${since}`);
    }
  }

  return { outputPath, since };
}

function getLatestByObjectTerm<T extends { recordnummer: number; originalTerm: string }>(rows: T[]): T[] {
  const latest = new Map<string, T>();

  for (const row of rows) {
    latest.set(`${row.recordnummer}::${row.originalTerm.trim().toLowerCase()}`, row);
  }

  return Array.from(latest.values());
}

function loadPidMap(): Map<number, { pidData: string; pidWork: string }> {
  if (!fs.existsSync(COLLECTION_JSON_PATH)) {
    return new Map();
  }

  const raw = fs.readFileSync(COLLECTION_JSON_PATH, 'utf-8');
  const collection = JSON.parse(raw) as CollectionObject[];

  const map = new Map<number, { pidData: string; pidWork: string }>();
  for (const row of collection) {
    map.set(row.recordnummer, {
      pidData: row.pidData || '',
      pidWork: row.pidWork || '',
    });
  }
  return map;
}

function main() {
  ensureReportsDir();

  const options = parseCliArgs();
  const sinceMillis = options.since ? Date.parse(options.since) : null;

  const allEdits = loadLocationEdits();
  const latestEdits = getLatestByObjectTerm(allEdits);
  const pidMap = loadPidMap();

  const filtered = sinceMillis === null
    ? latestEdits
    : latestEdits.filter((row) => {
      const ts = Date.parse(row.timestamp);
      return Number.isFinite(ts) && ts >= sinceMillis;
    });

  const rows: DeltaRow[] = filtered.map((edit) => {
    const pid = pidMap.get(edit.recordnummer);

    return {
      recordnummer: edit.recordnummer,
      objectnummer: edit.objectnummer,
      original_term: edit.originalTerm,
      resolved_location_label: edit.resolvedLocationLabel,
      wikidata_qid: edit.wikidataQid || '',
      wikidata_url: edit.wikidataUrl || '',
      latitude: edit.lat ?? '',
      longitude: edit.lng ?? '',
      resolution_level: edit.resolutionLevel,
      evidence_source: edit.evidenceSource,
      evidence_text: edit.evidenceText || '',
      author: edit.author,
      timestamp: edit.timestamp,
      remark: edit.remark || '',
      pid_data_uri: pid?.pidData || '',
      pid_werk_uri: pid?.pidWork || '',
    };
  });

  const csv = Papa.unparse(rows, {
    delimiter: ';',
    newline: '\n',
  });

  fs.writeFileSync(options.outputPath, csv, 'utf-8');

  console.log(
    `Wrote ${rows.length} delta rows to ${options.outputPath}${options.since ? ` (since ${options.since})` : ''}`,
  );
}

main();
