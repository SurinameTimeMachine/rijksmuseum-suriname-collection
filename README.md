# Rijksmuseum Suriname Collection

A Next.js application that explores the Suriname-related holdings of the
Rijksmuseum (Amsterdam) — paintings, prints, photographs, maps and objects
connected to the colonial history of Suriname.

The site offers a gallery, timeline, interactive map and statistics view, in
English and Dutch.

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000); the middleware will
redirect to the configured locale.

## Useful scripts

```bash
pnpm enrich                    # rebuild data/collection.json from CSV sources
pnpm sync:stm-gazetteer        # refresh data/places-gazetteer.jsonld
pnpm report:locations          # produce data/reports/location-report.*
pnpm check:ground-truth        # verify canonical data matches approved snapshots
```

See `package.json` for the full list.

## Data

All site content is derived from the CSV/JSON files under `data/`. The
production build reads `data/collection.json`, which is regenerated from the
source CSVs via `pnpm enrich`. Curation overlays live in
`data/location-edits.jsonl` and `data/term-wikidata-map.json`.

Ground truth is enforced through `ground-truth.snapshots.json` and the
`pnpm check:ground-truth` command. Canonical files must match one of the
approved commit snapshots, otherwise verification fails.
