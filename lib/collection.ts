import { cache } from 'react';

import {
  applyLocationEditsToObject,
  applyTermDefaultsToObject,
  buildLatestLocationEditMap,
  loadLocationEdits,
  loadTermDefaults,
} from '@/lib/location-curation';
import { getLicenseShortName } from '@/lib/utils';
import type {
  CollectionObject,
  CollectionStats,
  FilterOptions,
  SortOption,
} from '@/types/collection';

function getObjectLicenseStatus(
  obj: CollectionObject,
): 'public-domain' | 'copyrighted' | 'unknown' {
  const licenseInfo = getLicenseShortName(obj.license, obj.licenseLabel);
  if (licenseInfo.isUnknown) return 'unknown';
  return obj.isPublicDomain ? 'public-domain' : 'copyrighted';
}

/**
 * Load the full collection dataset.
 * Uses React cache() so repeated calls within a single request are deduplicated.
 */
export const getCollection = cache(async (): Promise<CollectionObject[]> => {
  // Dynamic import to read the JSON at build/request time
  const data = await import('@/data/collection.json');
  const collection = data.default as CollectionObject[];
  const latestLocationEdits = buildLatestLocationEditMap(loadLocationEdits());
  const termDefaults = loadTermDefaults();

  return collection
    .map((obj) => applyLocationEditsToObject(obj, latestLocationEdits))
    .map((obj) => applyTermDefaultsToObject(obj, termDefaults));
});

/**
 * Get a single object by its objectnummer (e.g. "SK-A-4075").
 */
export async function getObjectByNumber(
  objectnummer: string,
): Promise<CollectionObject | undefined> {
  const collection = await getCollection();
  return collection.find((obj) => obj.objectnummer === objectnummer);
}

/**
 * Apply filters and search to the collection.
 */
export async function getFilteredObjects(
  filters: Partial<FilterOptions>,
  sort: SortOption = 'date-desc',
  page: number = 1,
  pageSize: number = 48,
): Promise<{ objects: CollectionObject[]; total: number; totalPages: number }> {
  const collection = await getCollection();
  let filtered = [...collection];

  // Full-text search
  if (filters.query) {
    const q = filters.query.toLowerCase();
    filtered = filtered.filter(
      (obj) =>
        obj.titles.some((t) => t.toLowerCase().includes(q)) ||
        obj.description.toLowerCase().includes(q) ||
        obj.creators.some((c) => c.toLowerCase().includes(q)) ||
        obj.subjects.some((s) => s.toLowerCase().includes(q)) ||
        obj.persons.some((p) => p.toLowerCase().includes(q)) ||
        obj.objectnummer.toLowerCase().includes(q),
    );
  }

  // Object type filter
  if (filters.objectTypes && filters.objectTypes.length > 0) {
    filtered = filtered.filter((obj) =>
      obj.objectTypes.some((t) => filters.objectTypes!.includes(t)),
    );
  }

  // Date range filter
  if (filters.dateFrom !== null && filters.dateFrom !== undefined) {
    filtered = filtered.filter(
      (obj) => obj.year !== null && obj.year >= filters.dateFrom!,
    );
  }
  if (filters.dateTo !== null && filters.dateTo !== undefined) {
    filtered = filtered.filter(
      (obj) => obj.year !== null && obj.year <= filters.dateTo!,
    );
  }

  // Creator filter
  if (filters.creators && filters.creators.length > 0) {
    filtered = filtered.filter((obj) =>
      obj.creators.some((c) => filters.creators!.includes(c)),
    );
  }

  // Geographic keyword filter
  if (filters.geographicKeywords && filters.geographicKeywords.length > 0) {
    filtered = filtered.filter((obj) =>
      obj.geographicKeywords.some((g) =>
        filters.geographicKeywords!.includes(g),
      ),
    );
  }

  // Subject filter
  if (filters.subjects && filters.subjects.length > 0) {
    filtered = filtered.filter((obj) =>
      obj.subjects.some((s) => filters.subjects!.includes(s)),
    );
  }

  // Material filter
  if (filters.materials && filters.materials.length > 0) {
    filtered = filtered.filter((obj) =>
      obj.materials.some((m) => filters.materials!.includes(m)),
    );
  }

  // License status filter
  if (filters.licenseStatuses && filters.licenseStatuses.length > 0) {
    filtered = filtered.filter((obj) =>
      filters.licenseStatuses!.includes(getObjectLicenseStatus(obj)),
    );
  }

  // Has image filter
  if (filters.hasImage === true) {
    filtered = filtered.filter((obj) => obj.hasImage);
  } else if (filters.hasImage === false) {
    filtered = filtered.filter((obj) => !obj.hasImage);
  }

  // Sort
  switch (sort) {
    case 'date-asc':
      filtered.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
      break;
    case 'date-desc':
      filtered.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
      break;
    case 'title':
      filtered.sort((a, b) =>
        (a.titles[0] || '').localeCompare(b.titles[0] || ''),
      );
      break;
    case 'relevance':
    default:
      // Keep original order for relevance (search already prioritizes matches)
      break;
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const objects = filtered.slice(start, start + pageSize);

  return { objects, total, totalPages };
}

/**
 * Get aggregated statistics for the entire collection.
 */
export async function getStatistics(): Promise<CollectionStats> {
  const collection = await getCollection();

  const objectsByType: Record<string, number> = {};
  const objectsByDecade: Record<string, number> = {};
  const creatorCounts: Record<string, number> = {};
  const locationCounts: Record<string, number> = {};
  const subjectCounts: Record<string, number> = {};
  const materialCounts: Record<string, number> = {};
  let objectsWithImages = 0;
  let earliest = 9999;
  let latest = 0;

  for (const obj of collection) {
    // Types
    for (const t of obj.objectTypes) {
      objectsByType[t] = (objectsByType[t] || 0) + 1;
    }

    // Decades
    if (obj.year) {
      const decade = `${Math.floor(obj.year / 10) * 10}s`;
      objectsByDecade[decade] = (objectsByDecade[decade] || 0) + 1;
      if (obj.year < earliest) earliest = obj.year;
      if (obj.year > latest) latest = obj.year;
    }

    // Creators
    for (const c of obj.creators) {
      if (c && c !== 'anoniem' && c !== 'diverse vervaardigers') {
        creatorCounts[c] = (creatorCounts[c] || 0) + 1;
      }
    }

    // Locations
    for (const g of obj.geographicKeywords) {
      locationCounts[g] = (locationCounts[g] || 0) + 1;
    }

    // Subjects
    for (const s of obj.subjects) {
      subjectCounts[s] = (subjectCounts[s] || 0) + 1;
    }

    // Materials
    for (const m of obj.materials) {
      materialCounts[m] = (materialCounts[m] || 0) + 1;
    }

    if (obj.hasImage) objectsWithImages++;
  }

  const toSorted = (counts: Record<string, number>, limit = 20) =>
    Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));

  return {
    totalObjects: collection.length,
    objectsByType,
    objectsByDecade,
    topCreators: toSorted(creatorCounts),
    topLocations: toSorted(locationCounts),
    topSubjects: toSorted(subjectCounts),
    topMaterials: toSorted(materialCounts, 15),
    dateRange: { earliest, latest },
    objectsWithImages,
  };
}

/**
 * Get all unique values for filter facets.
 */
export async function getFacets() {
  const collection = await getCollection();

  const objectTypes = new Map<string, number>();
  const creators = new Map<string, number>();
  const geographicKeywords = new Map<string, number>();
  const subjects = new Map<string, number>();
  const materials = new Map<string, number>();
  const licenseStatuses = new Map<string, number>();

  for (const obj of collection) {
    for (const t of obj.objectTypes)
      objectTypes.set(t, (objectTypes.get(t) || 0) + 1);
    for (const c of obj.creators) creators.set(c, (creators.get(c) || 0) + 1);
    for (const g of obj.geographicKeywords)
      geographicKeywords.set(g, (geographicKeywords.get(g) || 0) + 1);
    for (const s of obj.subjects) subjects.set(s, (subjects.get(s) || 0) + 1);
    for (const m of obj.materials)
      materials.set(m, (materials.get(m) || 0) + 1);
    const licenseStatus = getObjectLicenseStatus(obj);
    licenseStatuses.set(
      licenseStatus,
      (licenseStatuses.get(licenseStatus) || 0) + 1,
    );
  }

  const mapToSorted = (map: Map<string, number>) =>
    Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([value, count]) => ({ value, count }));

  return {
    objectTypes: mapToSorted(objectTypes),
    creators: mapToSorted(creators),
    geographicKeywords: mapToSorted(geographicKeywords),
    subjects: mapToSorted(subjects),
    materials: mapToSorted(materials),
    licenseStatuses: mapToSorted(licenseStatuses),
  };
}

/**
 * Return objects with unresolved location interpretation for QA review.
 */
export async function getLocationQaObjects(): Promise<CollectionObject[]> {
  const collection = await getCollection();
  return collection.filter((obj) =>
    obj.geoKeywordDetails.some(
      (d) =>
        d.source === 'unresolved' ||
        d.flags.includes('outside-suriname') ||
        d.resolutionLevel === 'broader' ||
        d.resolutionLevel === 'city' ||
        d.resolutionLevel === 'country',
    ),
  );
}

/**
 * Get objects grouped by geographic keyword for the map view.
 */
export async function getObjectsByLocation(): Promise<
  Record<string, CollectionObject[]>
> {
  const collection = await getCollection();
  const grouped: Record<string, CollectionObject[]> = {};

  for (const obj of collection) {
    for (const loc of obj.geographicKeywords) {
      if (!grouped[loc]) grouped[loc] = [];
      grouped[loc].push(obj);
    }
  }

  return grouped;
}

/**
 * Get timeline data: objects grouped by year.
 */
export async function getTimelineData(): Promise<
  { year: number; count: number; objects: CollectionObject[] }[]
> {
  const collection = await getCollection();
  const byYear = new Map<number, CollectionObject[]>();

  for (const obj of collection) {
    if (obj.year) {
      if (!byYear.has(obj.year)) byYear.set(obj.year, []);
      byYear.get(obj.year)!.push(obj);
    }
  }

  return Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, objects]) => ({ year, count: objects.length, objects }));
}

/**
 * Get related objects (same location, creators, or subjects).
 */
export async function getRelatedObjects(
  obj: CollectionObject,
  limit = 6,
): Promise<CollectionObject[]> {
  const collection = await getCollection();

  const scored = collection
    .filter((o) => o.objectnummer !== obj.objectnummer)
    .map((candidate) => {
      let score = 0;
      // Shared geographic keywords
      for (const g of candidate.geographicKeywords) {
        if (
          obj.geographicKeywords.includes(g) &&
          g !== 'Suriname (Zuid-Amerika)'
        ) {
          score += 3;
        }
      }
      // Shared creators
      for (const c of candidate.creators) {
        if (obj.creators.includes(c) && c !== 'anoniem') score += 2;
      }
      // Shared subjects
      for (const s of candidate.subjects) {
        if (obj.subjects.includes(s)) score += 1;
      }
      return { object: candidate, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((s) => s.object);
}
