/**
 * Export place-linked Rijksmuseum images as a CIDOC-CRM/JSON-LD import bundle
 * for the Suriname Time Machine database model.
 *
 * One Rijksmuseum collection object becomes one E22 Human-Made Object source.
 * Each object-place relationship creates an E36 Visual Item and, when the
 * target gazetteer contains that place, an E13 visual-depiction observation.
 *
 * Usage:
 *   pnpm export:visual-lod
 *   pnpm export:visual-lod --out data/lod/custom.jsonld
 *   pnpm export:visual-lod --target-gazetteer /path/to/places-gazetteer.jsonld
 */

import fs from 'fs';
import path from 'path';
import {
  applyLocationEditsToObject,
  applyTermDefaultsToObject,
  buildLatestLocationEditMap,
  loadLocationEdits,
  loadTermDefaults,
} from '../lib/location-curation';
import type { CollectionObject, GeoKeywordDetail } from '../types/collection';

const DATA_DIR = path.join(process.cwd(), 'data');
const COLLECTION_PATH = path.join(DATA_DIR, 'collection.json');
const DEFAULT_OUTPUT_PATH = path.join(
  DATA_DIR,
  'lod',
  'rijksmuseum-visual-lod.jsonld',
);
const DEFAULT_REPORT_PATH = path.join(
  DATA_DIR,
  'lod',
  'rijksmuseum-visual-lod.report.json',
);
const DEFAULT_TARGET_GAZETTEER = path.resolve(
  process.cwd(),
  '..',
  'suriname-database-model',
  'data',
  'places-gazetteer.jsonld',
);

const BASE = 'https://data.suriname-timemachine.org/';
const SOURCE_TYPE = `${BASE}type/source-type/visual-record`;
const OBSERVATION_TYPE = `${BASE}type/observation-type/visual-depiction`;

type TargetPlace = {
  '@id': string;
  '@type'?: string[];
  id?: string;
  prefLabel?: string;
};

type TargetGazetteer = {
  '@graph': TargetPlace[];
};

type CliOptions = {
  outputPath: string;
  reportPath: string;
  targetGazetteerPath: string;
};

function parseArgs(): CliOptions {
  const options: CliOptions = {
    outputPath: DEFAULT_OUTPUT_PATH,
    reportPath: DEFAULT_REPORT_PATH,
    targetGazetteerPath: DEFAULT_TARGET_GAZETTEER,
  };
  const args = process.argv.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index + 1];
    if (!value) continue;

    if (args[index] === '--out') options.outputPath = path.resolve(value);
    if (args[index] === '--report') options.reportPath = path.resolve(value);
    if (args[index] === '--target-gazetteer') {
      options.targetGazetteerPath = path.resolve(value);
    }
  }

  return options;
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function placeIdentifier(uri: string): string {
  try {
    const identifier = new URL(uri).pathname.split('/').filter(Boolean).pop();
    return identifier ? slugify(identifier) : slugify(uri);
  } catch {
    return slugify(uri);
  }
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function isPhysicalFeature(place: TargetPlace): boolean {
  return toArray(place['@type']).some(
    (type) =>
      type === 'E25_Human-Made_Feature' || type === 'E26_Physical_Feature',
  );
}

function linkedDetails(object: CollectionObject): GeoKeywordDetail[] {
  const unique = new Map<string, GeoKeywordDetail>();
  for (const detail of object.geoKeywordDetails) {
    if (!detail.stmGazetteerUrl) continue;
    unique.set(detail.stmGazetteerUrl, detail);
  }
  return [...unique.values()];
}

function buildContext(): Record<string, unknown> {
  return {
    '@vocab': 'https://schema.org/',
    base: BASE,
    crm: 'http://www.cidoc-crm.org/cidoc-crm/',
    prov: 'http://www.w3.org/ns/prov#',
    sdo: 'https://schema.org/',
    xsd: 'http://www.w3.org/2001/XMLSchema#',
    dcterms: 'http://purl.org/dc/terms/',
    skos: 'http://www.w3.org/2004/02/skos/core#',
    E13_Attribute_Assignment: 'crm:E13_Attribute_Assignment',
    E22_Human_Made_Object: 'crm:E22_Human-Made_Object',
    E36_Visual_Item: 'crm:E36_Visual_Item',
    E52_Time_Span: 'crm:E52_Time-Span',
    E55_Type: 'crm:E55_Type',
    ProvenanceRecord: 'prov:Entity',
    P2_has_type: { '@id': 'crm:P2_has_type', '@type': '@id' },
    P4_has_time_span: { '@id': 'crm:P4_has_time-span', '@type': '@id' },
    P82a_begin_of_the_begin: {
      '@id': 'crm:P82a_begin_of_the_begin',
      '@type': 'xsd:date',
    },
    P82b_end_of_the_end: {
      '@id': 'crm:P82b_end_of_the_end',
      '@type': 'xsd:date',
    },
    P128_carries: { '@id': 'crm:P128_carries', '@type': '@id' },
    P128i_is_carried_by: {
      '@id': 'crm:P128i_is_carried_by',
      '@type': '@id',
    },
    P138_represents: { '@id': 'crm:P138_represents', '@type': '@id' },
    P140_assigned_attribute_to: {
      '@id': 'crm:P140_assigned_attribute_to',
      '@type': '@id',
    },
    P141_assigned: { '@id': 'crm:P141_assigned', '@type': '@id' },
    hadPrimarySource: { '@id': 'prov:hadPrimarySource', '@type': '@id' },
    wasDerivedFrom: { '@id': 'prov:wasDerivedFrom', '@type': '@id' },
    contentUrl: { '@id': 'sdo:contentUrl', '@type': '@id' },
    thumbnailUrl: { '@id': 'sdo:thumbnailUrl', '@type': '@id' },
    spatialCoverage: { '@id': 'sdo:spatialCoverage', '@type': '@id' },
    sameAs: { '@id': 'sdo:sameAs', '@type': '@id' },
    rijksmuseumDataUrl: { '@id': 'sdo:subjectOf', '@type': '@id' },
    rijksmuseumWorkUrl: { '@id': 'sdo:mainEntityOfPage', '@type': '@id' },
    wikidataUrl: { '@id': 'sdo:sameAs', '@type': '@id' },
    wikimediaUrl: { '@id': 'sdo:associatedMedia', '@type': '@id' },
    prefLabel: 'skos:prefLabel',
    sourceId: 'dcterms:identifier',
    timeSpan: 'dcterms:temporal',
    observationYear: { '@id': 'crm:P4_has_time-span', '@type': 'xsd:gYear' },
  };
}

function yearTimeSpan(year: number): Record<string, unknown> {
  return {
    '@id': `${BASE}timespan/${year}`,
    '@type': ['E52_Time_Span'],
    prefLabel: String(year),
    P82a_begin_of_the_begin: `${year}-01-01`,
    P82b_end_of_the_end: `${year}-12-31`,
  };
}

function main() {
  const options = parseArgs();
  if (!fs.existsSync(options.targetGazetteerPath)) {
    throw new Error(
      `Target gazetteer was not found: ${options.targetGazetteerPath}`,
    );
  }

  const targetGazetteer = JSON.parse(
    fs.readFileSync(options.targetGazetteerPath, 'utf-8'),
  ) as TargetGazetteer;
  const targetPlaces = new Map(
    targetGazetteer['@graph'].map((place) => [place['@id'], place]),
  );

  const collection = JSON.parse(
    fs.readFileSync(COLLECTION_PATH, 'utf-8'),
  ) as CollectionObject[];
  const latestEdits = buildLatestLocationEditMap(loadLocationEdits());
  const termDefaults = loadTermDefaults();
  const enriched = collection
    .map((object) => applyLocationEditsToObject(object, latestEdits))
    .map((object) => applyTermDefaultsToObject(object, termDefaults));

  const graph: Record<string, unknown>[] = [
    {
      '@id': SOURCE_TYPE,
      '@type': ['E55_Type'],
      prefLabel: 'Visual records',
      description:
        'Individual visual records from the Rijksmuseum collection, including paintings, drawings, prints, and photographs.',
    },
    {
      '@id': OBSERVATION_TYPE,
      '@type': ['E55_Type'],
      prefLabel: 'Visual depiction',
      description:
        'A time-scoped assertion that a place or physical feature is visually represented in a source.',
    },
  ];
  const timeSpans = new Set<number>();
  const unresolvedLinks: Record<string, unknown>[] = [];
  let sourceCount = 0;
  let visualItemCount = 0;
  let observationCount = 0;
  let publicDomainSourceCount = 0;
  const linkedPlaceUris = new Set<string>();

  for (const object of enriched) {
    if (!object.hasImage || !object.imageUrl) continue;
    const details = linkedDetails(object);
    if (details.length === 0) continue;

    const objectSlug = slugify(object.objectnummer);
    const sourceId = `rijksmuseum-${objectSlug}`;
    const sourceUri = `${BASE}source/${sourceId}`;
    const visualItems = details.map(
      (detail) =>
        `${BASE}visual-item/${sourceId}-${placeIdentifier(detail.stmGazetteerUrl ?? detail.term)}`,
    );
    const title = object.titles[0] || object.objectnummer;
    const itemTimeSpan = object.year
      ? `${BASE}timespan/${object.year}`
      : undefined;
    if (object.year) timeSpans.add(object.year);

    graph.push({
      '@id': sourceUri,
      '@type': ['E22_Human_Made_Object'],
      sourceId,
      prefLabel: title,
      P2_has_type: SOURCE_TYPE,
      P4_has_time_span: itemTimeSpan,
      timeSpan: object.year ? String(object.year) : null,
      maker: object.creators.join(', ') || null,
      holdingArchive: 'Rijksmuseum, Amsterdam',
      handleUrl: `https://www.rijksmuseum.nl/nl/collectie/${encodeURIComponent(object.objectnummer)}`,
      sameAs: object.pidWork || object.pidData,
      rijksmuseumDataUrl: object.pidData || null,
      rijksmuseumWorkUrl: object.pidWork || null,
      objectNumber: object.objectnummer,
      recordNumber: object.recordnummer,
      objectTypes: object.objectTypes,
      materials: object.materials,
      description: object.description || null,
      license: object.license || null,
      licenseLabel: object.licenseLabel || null,
      copyrightHolder: object.copyrightHolder || null,
      isPublicDomain: object.isPublicDomain,
      wikidataUrl: object.wikidataUrl || null,
      wikimediaUrl: object.wikimediaUrl || null,
      linkedToGazetteer: details.some((detail) =>
        targetPlaces.has(detail.stmGazetteerUrl ?? ''),
      ),
      P128_carries: visualItems.length === 1 ? visualItems[0] : visualItems,
      wasDerivedFrom: `${BASE}provenance/rijksmuseum-sur-inventory`,
    });
    sourceCount += 1;
    if (object.isPublicDomain) publicDomainSourceCount += 1;

    for (const detail of details) {
      const targetUri = detail.stmGazetteerUrl as string;
      const targetPlace = targetPlaces.get(targetUri);
      const visualUri = `${BASE}visual-item/${sourceId}-${placeIdentifier(targetUri)}`;
      const physicalTarget = targetPlace && isPhysicalFeature(targetPlace);

      graph.push({
        '@id': visualUri,
        '@type': ['E36_Visual_Item'],
        P128i_is_carried_by: sourceUri,
        ...(physicalTarget ? { P138_represents: targetUri } : {}),
        // E36 must not directly P138-represent an E53 Place. Spatial coverage
        // records the place association for E53 and unresolved target records.
        ...(!physicalTarget ? { spatialCoverage: targetUri } : {}),
        contentUrl: object.imageUrl,
        thumbnailUrl: object.thumbnailUrl || object.imageUrl,
        prefLabel: title,
        isPublicDomain: object.isPublicDomain,
        license: object.license || null,
        licenseLabel: object.licenseLabel || null,
        locationEvidence: {
          term: detail.term,
          matchedLabel: detail.matchedLabel,
          lat: detail.lat,
          lng: detail.lng,
          resolutionLevel: detail.resolutionLevel,
          source: detail.source,
        },
      });
      visualItemCount += 1;

      if (!targetPlace) {
        unresolvedLinks.push({
          sourceId,
          objectNumber: object.objectnummer,
          targetPlaceUri: targetUri,
          locationLabel: detail.matchedLabel || detail.term,
          year: object.year,
        });
        continue;
      }

      const observationUri = `${BASE}observation/visual/${sourceId}-${placeIdentifier(targetUri)}`;
      graph.push({
        '@id': observationUri,
        '@type': ['E13_Attribute_Assignment'],
        P2_has_type: OBSERVATION_TYPE,
        P140_assigned_attribute_to: targetUri,
        P141_assigned: visualUri,
        P4_has_time_span: itemTimeSpan,
        observationYear: object.year ? String(object.year) : null,
        hadPrimarySource: sourceUri,
        targetPlaceLabel: targetPlace.prefLabel || targetPlace.id || targetUri,
        observationNote: `Visually represented in Rijksmuseum object ${object.objectnummer}.`,
      });
      observationCount += 1;
      linkedPlaceUris.add(targetUri);
    }
  }

  for (const year of [...timeSpans].sort((left, right) => left - right)) {
    graph.push(yearTimeSpan(year));
  }

  graph.push({
    '@id': `${BASE}provenance/rijksmuseum-sur-inventory`,
    '@type': ['ProvenanceRecord'],
    sourceFile: 'data/collection.json, data/location-edits.jsonl',
    sourceColumn: 'imageUrl, metadata, geoKeywordDetails.stmGazetteerUrl',
    transformedBy: 'scripts/export-rijksmuseum-visual-lod.ts',
    modelEntity: 'E22 source + E36 visual item + E13 visual depiction observation',
    linkedVia:
      'stmGazetteerUrl -> target place URI; E36 P138 only for E25/E26 physical features',
  });

  const exportDocument = {
    '@context': buildContext(),
    '@id': `${BASE}dataset/rijksmuseum-visual-records`,
    '@type': 'sdo:Dataset',
    'sdo:name': 'Rijksmuseum Suriname Visual Records',
    'sdo:description':
      'Place-linked visual records from the Rijksmuseum Suriname collection, exported for the Suriname Time Machine linked-data model.',
    'sdo:license': 'https://creativecommons.org/licenses/by/4.0/',
    generatedAtTime: new Date().toISOString(),
    '@graph': graph,
  };

  const report = {
    generatedAtTime: exportDocument.generatedAtTime,
    targetGazetteer: options.targetGazetteerPath,
    counts: {
      rijksmuseumObjectSources: sourceCount,
      publicDomainObjectSources: publicDomainSourceCount,
      visualItems: visualItemCount,
      resolvedVisualObservations: observationCount,
      resolvedTargetPlaces: linkedPlaceUris.size,
      unresolvedPlaceLinks: unresolvedLinks.length,
      unresolvedTargetPlaces: new Set(
        unresolvedLinks.map((link) => link.targetPlaceUri),
      ).size,
    },
    unresolvedPlaceLinks: unresolvedLinks,
  };

  for (const outputPath of [options.outputPath, options.reportPath]) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  }
  fs.writeFileSync(
    options.outputPath,
    `${JSON.stringify(exportDocument, null, 2)}\n`,
    'utf-8',
  );
  fs.writeFileSync(
    options.reportPath,
    `${JSON.stringify(report, null, 2)}\n`,
    'utf-8',
  );

  console.log(`Exported ${sourceCount} Rijksmuseum E22 sources`);
  console.log(`Exported ${visualItemCount} E36 visual items`);
  console.log(`Exported ${observationCount} resolved E13 observations`);
  console.log(`Wrote ${options.outputPath}`);
  console.log(`Wrote ${options.reportPath}`);
}

main();
