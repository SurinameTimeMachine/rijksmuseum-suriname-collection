import 'server-only';
import type { RawCollectionStats } from '@/types/collection';
import fs from 'fs';
import Papa from 'papaparse';
import path from 'path';
import { cache } from 'react';

const RAW_CSV_PATH = path.join(
  process.cwd(),
  'data',
  'Suriname_objecten_export.csv',
);

interface RawCsvRow {
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

function splitMulti(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split('$')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '""');
}

function parseYear(start: string, end: string): number | null {
  const candidate = (start || end || '').trim();
  if (!candidate) return null;
  const match = candidate.match(/^(\d{4})/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  if (!Number.isFinite(year) || year < 1000 || year > 2200) return null;
  return year;
}

function toSorted(
  counts: Map<string, number>,
  limit = 20,
): { name: string; count: number }[] {
  return Array.from(counts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

/**
 * Parse the raw Rijksmuseum CSV export and compute aggregate statistics
 * without any enrichment, geocoding or curation. Used by the Statistics page
 * to show "the source as we received it" alongside the curated dataset.
 */
export const getRawCollectionStats = cache(
  async (): Promise<RawCollectionStats> => {
    const csvText = fs.readFileSync(RAW_CSV_PATH, 'utf8');
    const parsed = Papa.parse<RawCsvRow>(csvText, {
      header: true,
      delimiter: ';',
      skipEmptyLines: true,
    });

    const rows = parsed.data.filter((row) => row.objectnummer);

    const typeCounts = new Map<string, number>();
    const decadeCounts = new Map<string, number>();
    const creatorCounts = new Map<string, number>();
    const geoCounts = new Map<string, number>();

    let earliest = 9999;
    let latest = 0;
    let anonymousCount = 0;

    for (const row of rows) {
      for (const t of splitMulti(row.objectnaam)) {
        typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
      }

      const year = parseYear(
        row['datering.datum.start'],
        row['datering.datum.eind'],
      );
      if (year !== null) {
        const decade = `${Math.floor(year / 10) * 10}s`;
        decadeCounts.set(decade, (decadeCounts.get(decade) || 0) + 1);
        if (year < earliest) earliest = year;
        if (year > latest) latest = year;
      }

      const creators = splitMulti(row.vervaardiger);
      let hasNamedCreator = false;
      for (const c of creators) {
        if (c.toLowerCase() === 'anoniem') continue;
        if (c.toLowerCase() === 'diverse vervaardigers') continue;
        creatorCounts.set(c, (creatorCounts.get(c) || 0) + 1);
        hasNamedCreator = true;
      }
      if (!hasNamedCreator) anonymousCount += 1;

      for (const g of splitMulti(row.geografisch_trefwoord)) {
        geoCounts.set(g, (geoCounts.get(g) || 0) + 1);
      }
    }

    const objectsByType: Record<string, number> = {};
    for (const [k, v] of typeCounts) objectsByType[k] = v;
    const objectsByDecade: Record<string, number> = {};
    for (const [k, v] of decadeCounts) objectsByDecade[k] = v;

    return {
      totalObjects: rows.length,
      objectsByType,
      objectsByDecade,
      topCreators: toSorted(creatorCounts, 15),
      topGeographicKeywords: toSorted(geoCounts, 20),
      dateRange: {
        earliest: earliest === 9999 ? 0 : earliest,
        latest,
      },
      uniqueCreators: creatorCounts.size,
      uniqueGeographicKeywords: geoCounts.size,
      anonymousCount,
    };
  },
);
