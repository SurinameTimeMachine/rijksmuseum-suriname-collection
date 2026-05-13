import {
  appendLocationEdit,
  applyStmFirstLocation,
  buildLatestLocationEditMap,
  loadLocationEdits,
  normalizeWikidataReference,
} from '../lib/location-curation';
import type { LocationEditRecord } from '../types/collection';

type CliOptions = {
  dryRun: boolean;
  author: string;
};

type BackfillSummary = {
  keysSeen: number;
  changed: number;
  unchanged: number;
  writeMode: 'dry-run' | 'write';
};

function getEditKey(record: Pick<LocationEditRecord, 'recordnummer' | 'originalTerm'>): string {
  return `${record.recordnummer}::${record.originalTerm.toLowerCase()}`;
}

function parseCliOptions(): CliOptions {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const authorIndex = args.findIndex((arg) => arg === '--author');
  const author = authorIndex >= 0 ? (args[authorIndex + 1] || '').trim() : '';

  return {
    dryRun,
    author: author || 'STM backfill',
  };
}

function normalizeRecord(
  record: LocationEditRecord,
  fallback: LocationEditRecord | undefined,
): LocationEditRecord {
  const merged: LocationEditRecord = {
    ...record,
    wikidataQid: record.wikidataQid ?? fallback?.wikidataQid ?? null,
    wikidataUrl: record.wikidataUrl ?? fallback?.wikidataUrl ?? null,
    gazetteerUrl: record.gazetteerUrl ?? fallback?.gazetteerUrl ?? null,
    lat: record.lat ?? fallback?.lat ?? null,
    lng: record.lng ?? fallback?.lng ?? null,
  };

  const normalized = applyStmFirstLocation(merged);
  const normalizedQid =
    normalizeWikidataReference(normalized.wikidataUrl || '').qid ||
    merged.wikidataQid;

  return {
    ...merged,
    wikidataQid: normalizedQid,
    wikidataUrl: normalized.wikidataUrl,
    gazetteerUrl: normalized.gazetteerUrl,
    lat: normalized.lat,
    lng: normalized.lng,
  };
}

function didRecordChange(a: LocationEditRecord, b: LocationEditRecord): boolean {
  return (
    a.wikidataQid !== b.wikidataQid ||
    a.wikidataUrl !== b.wikidataUrl ||
    a.gazetteerUrl !== b.gazetteerUrl ||
    a.lat !== b.lat ||
    a.lng !== b.lng
  );
}

function main() {
  const options = parseCliOptions();
  const existing = loadLocationEdits();
  const latestByKey = buildLatestLocationEditMap(existing);
  const latestWithCoordsByKey = new Map<string, LocationEditRecord>();

  // location-edits.jsonl is append-only and chronological, and `existing`
  // preserves that order. We iterate forward and rely on Map.set() overwriting
  // earlier entries for the same key (getEditKey), so latestWithCoordsByKey
  // ends up holding the most recent record-with-coordinates per key.
  for (const record of existing) {
    if (record.lat === null || record.lng === null) continue;
    latestWithCoordsByKey.set(getEditKey(record), record);
  }

  const summary: BackfillSummary = {
    keysSeen: latestByKey.size,
    changed: 0,
    unchanged: 0,
    writeMode: options.dryRun ? 'dry-run' : 'write',
  };

  for (const latest of latestByKey.values()) {
    const normalized = normalizeRecord(latest, latestWithCoordsByKey.get(getEditKey(latest)));

    if (!didRecordChange(latest, normalized)) {
      summary.unchanged += 1;
      continue;
    }

    summary.changed += 1;

    if (options.dryRun) {
      continue;
    }

    const nextRecord: LocationEditRecord = {
      ...normalized,
      author: options.author,
      timestamp: new Date().toISOString(),
    };

    appendLocationEdit(nextRecord);
  }

  console.log(
    [
      `STM-first backfill (${summary.writeMode})`,
      `keysSeen=${summary.keysSeen}`,
      `changed=${summary.changed}`,
      `unchanged=${summary.unchanged}`,
    ].join(' '),
  );
}

main();
