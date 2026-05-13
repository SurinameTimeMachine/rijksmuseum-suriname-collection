import MapClientWrapper from '@/components/MapClientWrapper';
import ScrollReveal from '@/components/ScrollReveal';
import { getObjectsByLocation } from '@/lib/collection';
import type { CollectionObject } from '@/types/collection';
import { getTranslations, setRequestLocale } from 'next-intl/server';

const MAP_BUCKET_COORD_PRECISION = 5;
const MAP_BUCKET_NEAR_COORD_THRESHOLD = 0.00005;
const MAP_DOMINANT_MERGE_MAX_DISTANCE = 0.35;
const MAP_DOMINANT_MERGE_MAX_SHARE = 0.2;
const MAP_DOMINANT_MERGE_MAX_COUNT = 25;
const AMBIGUOUS_LABELS = new Set(['suriname']);
const GENERIC_MAP_LABELS = new Set([
  'suriname',
  'suriname (zuid-amerika)',
  'paramaribo',
  'paramaribo (stad)',
  'nickerie',
]);

function normalizeBucketCoordinate(value: number): number {
  return Number(value.toFixed(MAP_BUCKET_COORD_PRECISION));
}

function areNearCoordinates(a: number, b: number): boolean {
  return Math.abs(a - b) <= MAP_BUCKET_NEAR_COORD_THRESHOLD;
}

function coordinateDistance(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  return Math.hypot(aLat - bLat, aLng - bLng);
}

function normalizeMapLabelKey(input: string | null | undefined): string {
  return (input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getDetailSpecificityScore(
  detail: CollectionObject['geoKeywordDetails'][number],
): number {
  const name = detail.matchedLabel?.trim() || detail.term;
  const normalizedName = normalizeMapLabelKey(name);
  const normalizedTerm = normalizeMapLabelKey(detail.term);
  const isGeneric =
    GENERIC_MAP_LABELS.has(normalizedName) ||
    GENERIC_MAP_LABELS.has(normalizedTerm);

  const resolutionScore =
    detail.resolutionLevel === 'exact'
      ? 40
      : detail.resolutionLevel === 'city'
        ? 20
        : detail.resolutionLevel === 'country'
          ? 10
          : 5;
  const sourceScore = detail.source === 'edit' ? 15 : 0;
  const stmScore = detail.stmGazetteerUrl ? 20 : 0;
  const nonGenericScore = isGeneric ? 0 : 100;

  return nonGenericScore + resolutionScore + sourceScore + stmScore;
}

function pickPrimaryMapDetail(
  obj: CollectionObject,
): CollectionObject['geoKeywordDetails'][number] | null {
  const mappable = obj.geoKeywordDetails.filter(
    (detail) => detail.lat !== null && detail.lng !== null,
  );
  if (mappable.length === 0) return null;
  return [...mappable].sort(
    (a, b) => getDetailSpecificityScore(b) - getDetailSpecificityScore(a),
  )[0];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'map' });
  return { title: t('title') };
}

export default async function MapPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'map' });
  const objectsByLocation = await getObjectsByLocation();

  // Build map buckets per object-specific resolved detail.
  // This avoids pinning all objects with the same keyword to objects[0].
  // `id` is a synthetic clustering id; `keyword` is the original gallery
  // search term so the "View in Gallery" link still filters correctly.
  const locationBuckets = new Map<
    string,
    {
      id: string;
      keyword: string;
      geo: {
        name: string;
        lat: number;
        lng: number;
        region: 'suriname' | 'netherlands' | 'other';
        objectCount: number;
      };
      objects: CollectionObject[];
    }
  >();
  const bucketsByNameRegion = new Map<string, string[]>();
  const placedObjects = new Map<string, string>();

  for (const [keyword, objects] of Object.entries(objectsByLocation)) {
    for (const obj of objects) {
      if (placedObjects.has(obj.objectnummer)) continue;

      const detail = pickPrimaryMapDetail(obj);
      if (!detail || detail.lat == null || detail.lng == null) continue;

      const name = detail.matchedLabel?.trim() || detail.term;
      const region = detail.region ?? ('other' as const);
      const bucketLat = normalizeBucketCoordinate(detail.lat);
      const bucketLng = normalizeBucketCoordinate(detail.lng);
      const nameRegionKey = `${name}::${region}`;

      let bucketId = `${name}::${bucketLat}::${bucketLng}::${region}`;
      const candidateKeys = bucketsByNameRegion.get(nameRegionKey) || [];
      for (const existingKey of candidateKeys) {
        const existing = locationBuckets.get(existingKey);
        if (!existing) continue;

        if (
          areNearCoordinates(existing.geo.lat, bucketLat) &&
          areNearCoordinates(existing.geo.lng, bucketLng)
        ) {
          bucketId = existingKey;
          break;
        }
      }

      if (!locationBuckets.has(bucketId)) {
        locationBuckets.set(bucketId, {
          id: bucketId,
          keyword,
          geo: {
            name,
            lat: bucketLat,
            lng: bucketLng,
            region,
            objectCount: 0,
          },
          objects: [],
        });

        const keys = bucketsByNameRegion.get(nameRegionKey) || [];
        keys.push(bucketId);
        bucketsByNameRegion.set(nameRegionKey, keys);
      }

      const bucket = locationBuckets.get(bucketId)!;
      bucket.objects.push(obj);
      bucket.geo.objectCount = bucket.objects.length;
      placedObjects.set(obj.objectnummer, bucketId);
    }
  }

  // Merge small outlier clusters into the dominant cluster per label+region.
  // Skip explicitly ambiguous labels such as Suriname (country/river ambiguity).
  for (const [nameRegionKey, bucketKeys] of bucketsByNameRegion.entries()) {
    const [name] = nameRegionKey.split('::');
    if (AMBIGUOUS_LABELS.has(normalizeMapLabelKey(name))) continue;
    if (bucketKeys.length < 2) continue;

    const buckets = bucketKeys
      .map((key) => locationBuckets.get(key))
      .filter((bucket): bucket is NonNullable<typeof bucket> =>
        Boolean(bucket),
      );
    if (buckets.length < 2) continue;

    const dominant = [...buckets].sort(
      (a, b) => b.geo.objectCount - a.geo.objectCount,
    )[0];
    if (dominant.geo.objectCount <= 0) continue;

    for (const candidate of buckets) {
      if (candidate.id === dominant.id) continue;

      const share = candidate.geo.objectCount / dominant.geo.objectCount;
      const distance = coordinateDistance(
        candidate.geo.lat,
        candidate.geo.lng,
        dominant.geo.lat,
        dominant.geo.lng,
      );

      if (candidate.geo.objectCount > MAP_DOMINANT_MERGE_MAX_COUNT) continue;
      if (share > MAP_DOMINANT_MERGE_MAX_SHARE) continue;
      if (distance > MAP_DOMINANT_MERGE_MAX_DISTANCE) continue;

      dominant.objects.push(...candidate.objects);
      dominant.geo.objectCount = dominant.objects.length;
      locationBuckets.delete(candidate.id);
    }
  }

  const locations = Array.from(locationBuckets.values());

  return (
    <div className="max-w-350 mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <ScrollReveal>
        <div className="mb-8">
          <h1>{t('title')}</h1>
          <p className="mt-2 text-(--color-warm-gray)">{t('subtitle')}</p>
        </div>
      </ScrollReveal>

      <MapClientWrapper locations={locations} />
    </div>
  );
}
