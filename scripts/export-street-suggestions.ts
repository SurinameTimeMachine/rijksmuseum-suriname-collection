import fs from 'fs';
import Papa from 'papaparse';
import path from 'path';

import type { CollectionObject } from '../types/collection';

const DATA_DIR = path.join(process.cwd(), 'data');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');
const COLLECTION_PATH = path.join(DATA_DIR, 'collection.json');
const STREET_ALIASES_PATH = path.join(DATA_DIR, 'paramaribo-street-aliases.json');

const SUGGESTION_LIMIT_PER_OBJECT = 3;
const SOURCE_WEIGHTS = {
  title: 40,
  commons: 30,
  description: 20,
} as const;

const PARAMARIBO_HINTS = ['paramaribo', 'suriname'];

type StreetSuggestionSource = keyof typeof SOURCE_WEIGHTS;

type StreetAliasEntry = {
  label: string;
  aliases: string[];
  wikidataQid: string | null;
};

type StreetSuggestion = {
  label: string;
  matchedVariant: string;
  source: StreetSuggestionSource;
  snippet: string;
  wikidataQid: string | null;
  score: number;
};

type OutputRow = {
  objectnummer: string;
  title: string;
  matched_field: string;
  suggested_street_label: string;
  matched_variant: string;
  snippet: string;
  suggested_wikidata_qid: string;
  score: number;
  geographic_keywords: string;
  current_geo_terms: string;
  wikimedia_url: string;
};

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[-./_,:;()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractCommonsText(url: string | null): string {
  if (!url) return '';

  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

function hasParamariboContext(obj: CollectionObject): boolean {
  const values = [
    ...obj.geographicKeywords,
    ...obj.geoKeywordDetails.flatMap((detail) => [
      detail.term,
      detail.broaderTerm || '',
      detail.matchedLabel || '',
    ]),
  ];

  return values.some((value) => {
    const normalized = normalizeText(value);
    return PARAMARIBO_HINTS.some((hint) => normalized.includes(hint));
  });
}

function buildSnippet(text: string, variant: string): string {
  const match = text.match(new RegExp(escapeRegExp(variant), 'i'));
  if (!match || match.index === undefined) {
    return variant;
  }

  const start = Math.max(0, match.index - 60);
  const end = Math.min(text.length, match.index + match[0].length + 60);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';

  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function getSearchSources(obj: CollectionObject) {
  return [
    {
      source: 'title' as const,
      text: obj.titles.filter(Boolean).join(' | '),
    },
    {
      source: 'description' as const,
      text: obj.description || '',
    },
    {
      source: 'commons' as const,
      text: extractCommonsText(obj.wikimediaUrl),
    },
  ].filter((entry) => entry.text.trim());
}

function getStreetSuggestions(
  obj: CollectionObject,
  aliases: StreetAliasEntry[],
): StreetSuggestion[] {
  if (!hasParamariboContext(obj)) return [];

  const existingTerms = new Set(
    obj.geoKeywordDetails.flatMap((detail) => [
      normalizeText(detail.term),
      normalizeText(detail.matchedLabel || ''),
    ]),
  );

  const searchSources = getSearchSources(obj).map((entry) => ({
    ...entry,
    normalized: normalizeText(entry.text),
  }));

  const bestByLabel = new Map<string, StreetSuggestion>();

  for (const entry of aliases) {
    const normalizedLabel = normalizeText(entry.label);
    if (!normalizedLabel || existingTerms.has(normalizedLabel)) continue;

    const variants = [entry.label, ...entry.aliases].filter(Boolean);

    for (const variant of variants) {
      const normalizedVariant = normalizeText(variant);
      if (!normalizedVariant || normalizedVariant.length < 8) continue;

      const pattern = new RegExp(`(^|\\b)${escapeRegExp(normalizedVariant)}(\\b|$)`, 'i');

      for (const sourceEntry of searchSources) {
        if (!pattern.test(sourceEntry.normalized)) continue;

        const candidate: StreetSuggestion = {
          label: entry.label,
          matchedVariant: variant,
          source: sourceEntry.source,
          snippet: buildSnippet(sourceEntry.text, variant),
          wikidataQid: entry.wikidataQid,
          score:
            SOURCE_WEIGHTS[sourceEntry.source] +
            Math.min(normalizedVariant.length, 20) +
            (variant === entry.label ? 6 : 0),
        };

        const currentBest = bestByLabel.get(entry.label);
        if (!currentBest || candidate.score > currentBest.score) {
          bestByLabel.set(entry.label, candidate);
        }
      }
    }
  }

  return Array.from(bestByLabel.values())
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, SUGGESTION_LIMIT_PER_OBJECT);
}

function loadCollection(): CollectionObject[] {
  const raw = fs.readFileSync(COLLECTION_PATH, 'utf-8');
  return JSON.parse(raw) as CollectionObject[];
}

function loadStreetAliases(): StreetAliasEntry[] {
  const raw = fs.readFileSync(STREET_ALIASES_PATH, 'utf-8');
  return JSON.parse(raw) as StreetAliasEntry[];
}

function buildDefaultOutputPath(): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return path.join(REPORTS_DIR, `street-suggestions-${stamp}.csv`);
}

function main() {
  if (!fs.existsSync(COLLECTION_PATH)) {
    console.error(`Collection file not found: ${COLLECTION_PATH}`);
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(STREET_ALIASES_PATH)) {
    console.error(`Street alias JSON not found: ${STREET_ALIASES_PATH}`);
    process.exitCode = 1;
    return;
  }

  ensureReportsDir();

  const outputPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : buildDefaultOutputPath();

  const collection = loadCollection();
  const aliases = loadStreetAliases();
  const rows: OutputRow[] = [];

  for (const obj of collection) {
    const suggestions = getStreetSuggestions(obj, aliases);
    if (suggestions.length === 0) continue;

    for (const suggestion of suggestions) {
      rows.push({
        objectnummer: obj.objectnummer,
        title: obj.titles[0] || '',
        matched_field: suggestion.source,
        suggested_street_label: suggestion.label,
        matched_variant: suggestion.matchedVariant,
        snippet: suggestion.snippet,
        suggested_wikidata_qid: suggestion.wikidataQid || '',
        score: suggestion.score,
        geographic_keywords: obj.geographicKeywords.join(' | '),
        current_geo_terms: obj.geoKeywordDetails.map((detail) => detail.term).join(' | '),
        wikimedia_url: obj.wikimediaUrl || '',
      });
    }
  }

  const csv = Papa.unparse(rows, {
    delimiter: ';',
    newline: '\n',
  });

  fs.writeFileSync(outputPath, csv, 'utf-8');

  const objectCount = new Set(rows.map((row) => row.objectnummer)).size;
  console.log(`Wrote ${rows.length} street suggestion rows for ${objectCount} objects to ${outputPath}`);
}

main();