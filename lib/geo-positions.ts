import type { CollectionObject } from '@/types/collection';
import type {
  GeoPosition,
  GeoPositionStore,
  GeoPositionWithObject,
} from '@/types/geo-position';
import { cache } from 'react';

/**
 * Load the geo-positions dataset.
 * Uses React cache() so repeated calls within a single request are deduplicated.
 */
export const getGeoPositions = cache(async (): Promise<GeoPositionStore> => {
  const data = await import('@/data/geo-positions.json');
  return data.default as GeoPositionStore;
});

/**
 * Get all approved geo-positions for a specific object.
 */
export async function getPositionsForObject(
  objectnummer: string,
): Promise<GeoPosition[]> {
  const store = await getGeoPositions();
  return (store[objectnummer] || []).filter((p) => p.status === 'approved');
}

/**
 * Get the latest approved geo-position for a specific object, if any.
 */
export async function getApprovedPosition(
  objectnummer: string,
): Promise<GeoPosition | null> {
  const positions = await getPositionsForObject(objectnummer);
  if (positions.length === 0) return null;
  // Return most recent approved position
  return positions.sort(
    (a, b) =>
      new Date(b.contributedAt).getTime() - new Date(a.contributedAt).getTime(),
  )[0];
}

/**
 * Get collection objects that haven't been geo-positioned yet.
 * Prioritises objects with images and specific geographic keywords.
 */
export async function getUnpositionedObjects(
  collection: CollectionObject[],
): Promise<CollectionObject[]> {
  const store = await getGeoPositions();

  // Objects with at least one approved position are considered "done"
  const positionedSet = new Set(
    Object.entries(store)
      .filter(([, positions]) => positions.some((p) => p.status === 'approved'))
      .map(([objectnummer]) => objectnummer),
  );

  return collection
    .filter((obj) => !positionedSet.has(obj.objectnummer))
    .sort((a, b) => {
      // Prioritise: has image > has specific geo keywords > rest
      const scoreA =
        (a.hasImage ? 10 : 0) +
        (a.geographicKeywords.length > 1 ? 5 : 0) +
        (a.geographicKeywords.some((k) => k !== 'Suriname (Zuid-Amerika)')
          ? 3
          : 0);
      const scoreB =
        (b.hasImage ? 10 : 0) +
        (b.geographicKeywords.length > 1 ? 5 : 0) +
        (b.geographicKeywords.some((k) => k !== 'Suriname (Zuid-Amerika)')
          ? 3
          : 0);
      return scoreB - scoreA;
    });
}

/**
 * Get all approved geo-positions joined with basic object info for map display.
 */
export async function getPositionedObjects(
  collection: CollectionObject[],
): Promise<GeoPositionWithObject[]> {
  const store = await getGeoPositions();
  const objectMap = new Map(collection.map((o) => [o.objectnummer, o]));
  const results: GeoPositionWithObject[] = [];

  for (const [objectnummer, positions] of Object.entries(store)) {
    const approved = positions.filter((p) => p.status === 'approved');
    if (approved.length === 0) continue;

    // Use the most recent approved position
    const latest = approved.sort(
      (a, b) =>
        new Date(b.contributedAt).getTime() -
        new Date(a.contributedAt).getTime(),
    )[0];

    const obj = objectMap.get(objectnummer);
    if (!obj) continue;

    results.push({
      ...latest,
      title: obj.titles[0] || obj.objectnummer,
      creator:
        obj.creators.filter((c) => c !== 'anoniem').join(', ') || 'Anonymous',
      thumbnailUrl: obj.thumbnailUrl,
      year: obj.year,
    });
  }

  return results;
}

/**
 * Count how many objects have been positioned vs total.
 */
export async function getPositioningProgress(
  totalObjects: number,
): Promise<{ positioned: number; total: number; percentage: number }> {
  const store = await getGeoPositions();
  const positioned = Object.values(store).filter((positions) =>
    positions.some((p) => p.status === 'approved'),
  ).length;

  return {
    positioned,
    total: totalObjects,
    percentage:
      totalObjects > 0 ? Math.round((positioned / totalObjects) * 100) : 0,
  };
}
