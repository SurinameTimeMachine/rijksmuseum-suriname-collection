import fs from 'fs';
import Papa from 'papaparse';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');
const STREET_ALIASES_PATH = path.join(DATA_DIR, 'paramaribo-street-aliases.json');
const GEO_CSV_PATH = path.join(DATA_DIR, 'Geo thesau Suriname.csv');

type StreetAliasEntry = {
  label: string;
  aliases: string[];
  wikidataQid: string | null;
};

type GeoRow = {
  term?: string;
  match_wiki?: string;
  broader_term?: string;
  wikidata?: string;
};

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

function buildDefaultOutputPath() {
  const stamp = new Date().toISOString().slice(0, 10);
  return path.join(REPORTS_DIR, `paramaribo-street-alias-coverage-${stamp}.csv`);
}

function normalizeTerm(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(paramaribo\)/gi, '')
    .replace(/[’']/g, '')
    .replace(/[-.,/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function loadStreetAliases(): StreetAliasEntry[] {
  const raw = fs.readFileSync(STREET_ALIASES_PATH, 'utf-8');
  return JSON.parse(raw) as StreetAliasEntry[];
}

function loadGeoRows(): GeoRow[] {
  const raw = fs.readFileSync(GEO_CSV_PATH);
  const csv = new TextDecoder('latin1').decode(raw);
  const parsed = Papa.parse<GeoRow>(csv, {
    header: true,
    delimiter: ';',
    skipEmptyLines: true,
  });

  return parsed.data;
}

function buildGeoVariantMap(rows: GeoRow[]) {
  const variantMap = new Map<string, GeoRow>();

  for (const row of rows) {
    for (const value of [(row.term || '').trim(), (row.match_wiki || '').trim()]) {
      if (!value) continue;
      const key = normalizeTerm(value);
      if (!key || variantMap.has(key)) continue;
      variantMap.set(key, row);
    }
  }

  return variantMap;
}

function main() {
  if (!fs.existsSync(STREET_ALIASES_PATH)) {
    console.error(`Street alias JSON not found: ${STREET_ALIASES_PATH}`);
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(GEO_CSV_PATH)) {
    console.error(`Geo thesaurus CSV not found: ${GEO_CSV_PATH}`);
    process.exitCode = 1;
    return;
  }

  ensureReportsDir();

  const outputPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : buildDefaultOutputPath();

  const geoVariantMap = buildGeoVariantMap(loadGeoRows());
  const rows = loadStreetAliases().map((entry) => {
    const variants = [entry.label, ...entry.aliases];
    const matches = variants.flatMap((variant) => {
      const hit = geoVariantMap.get(normalizeTerm(variant));
      if (!hit) return [];
      return [{
        variant,
        term: (hit.term || '').trim(),
        label: (hit.match_wiki || '').trim(),
        broaderTerm: (hit.broader_term || '').trim(),
        wikidata: (hit.wikidata || '').trim(),
      }];
    });

    const matchedVariants = new Set(matches.map((match) => match.variant));
    const missingVariants = variants.filter((variant) => !matchedVariants.has(variant));
    const primaryMatch = matches[0];

    return {
      street_label: entry.label,
      aliases: entry.aliases.join(' | '),
      street_wikidata_qid: entry.wikidataQid || '',
      variant_count: variants.length,
      matched_variant_count: matchedVariants.size,
      missing_variant_count: missingVariants.length,
      matched_variants: Array.from(matchedVariants).join(' | '),
      missing_variants: missingVariants.join(' | '),
      matched_thesaurus_term: primaryMatch?.term || '',
      matched_label: primaryMatch?.label || '',
      broader_term: primaryMatch?.broaderTerm || '',
      thesaurus_wikidata: primaryMatch?.wikidata || '',
      coverage:
        matchedVariants.size === 0
          ? 'missing'
          : missingVariants.length === 0
            ? 'covered'
            : 'partial',
    };
  });

  const csv = Papa.unparse(rows, {
    delimiter: ';',
    newline: '\n',
  });

  fs.writeFileSync(outputPath, csv, 'utf-8');

  const summary = rows.reduce(
    (counts, row) => {
      counts[row.coverage] = (counts[row.coverage] || 0) + 1;
      return counts;
    },
    {} as Record<string, number>,
  );

  console.log(`Wrote ${rows.length} street coverage rows to ${outputPath}`);
  console.log(
    `Coverage summary: covered=${summary.covered || 0}, partial=${summary.partial || 0}, missing=${summary.missing || 0}`,
  );
}

main();