This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Location Review Workflow

Werkwijze in het kort:

1. Start vanuit een bestaand evaluatiebestand of een lege export.
2. Migreer legacy invoer (`y`, `x`, vrije tekst) naar een expliciet reviewformulier met statusvelden.
3. Verwerk positieve beslissingen (`accept`, `custom`) naar `data/location-edits.jsonl`.
4. Genereer opnieuw een workbook op basis van de bijgewerkte curatiestand, zodat nog niet beoordeelde rijen betere suggesties en minder doublures krijgen.
5. Gebruik het tabblad `Auto-gefilterd` als auditspoor voor automatisch weggelaten bredere locaties.
6. Gebruik `b` in `ef_review_locatie` voor locaties buiten Suriname: de rij telt als beoordeeld, maar wordt bewust overgeslagen tijdens import.

Generate a curator workbook with:

```bash
npm run report:location-evaluation -- --existing-review data/reports/location-evaluation-2026-04-14-TO-merged.xlsx --output data/reports/location-review.xlsx
```

The generated workbook uses `ef_review_status` as the main decision field:

- `accept`: accept the best suggested location
- `remove-broader`: remove a broader location because a more specific one is already present for the same object
- `reject`: reject the current term or suggestion without assigning a new primary location on that row
- `custom`: provide a concrete replacement in `ef_review_locatie`

Belangrijke kolommen in het nieuwe formulier:

- `ef_review_status`: hoofdkeuze voor de curator
- `ef_review_locatie`: alleen invullen bij `custom`; shorthands: `s` = Suriname (Q730), `b` = buiten scope (buiten Suriname, niet geïmporteerd)
- `ef_review_status`: shorthands: `a` of `y` = `accept`
- `ef_review_opmerking`: korte motivatie of nuance
- `ef_review_migratie_bron`: laat zien hoe oude invoer is vertaald (`legacy-y`, `legacy-x`, `legacy-custom`, `legacy-y-empty`)
- `auto_review_status` en `auto_review_reden`: automatische suggesties voor bredere locaties die buiten de hoofdreview kunnen blijven

Apply reviewed positive decisions with:

```bash
npm run import:location-reviews -- --source data/reports/location-review.xlsx --author TvO --conflict=skip
```

The importer currently writes `accept` and `custom` decisions to `data/location-edits.jsonl`. Negative decisions such as `remove-broader` and `reject` are preserved in the workbook flow but skipped during import until a dedicated negative-edit pipeline is added.

Voor verslaglegging:

- De dry-run samenvatting kan worden weggeschreven via `--summary-out`.
- De importer maakt automatisch een backup van `data/location-edits.jsonl` voordat er geschreven wordt.
- Het tabblad `Samenvatting` in het workbook telt onder meer reviewrijen, automatisch gefilterde bredere rijen en overgenomen reviews.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
