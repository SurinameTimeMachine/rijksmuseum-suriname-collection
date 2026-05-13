import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const OUTPUT_PATH = path.join(DATA_DIR, 'places-gazetteer.jsonld');
const GAZETTEER_URL =
  'https://suriname-database-model.vercel.app/data/places-gazetteer.jsonld';

async function main() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const response = await fetch(GAZETTEER_URL, {
    headers: {
      Accept: 'application/ld+json, application/json, */*',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch gazetteer (${response.status})`);
  }

  const text = await response.text();
  const parsed = JSON.parse(text) as { '@graph'?: unknown[] };
  const count = Array.isArray(parsed['@graph']) ? parsed['@graph'].length : 0;

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(parsed, null, 2)}\n`, 'utf-8');
  console.log(`Synced ${count} places to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
